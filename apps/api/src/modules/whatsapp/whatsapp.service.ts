import { InjectQueue } from "@nestjs/bullmq";
import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";

@Injectable()
export class WhatsAppService {
  constructor(
    @InjectQueue("whatsapp-inbound") private readonly queue: Queue,
    private readonly whatsappRepo: WhatsAppRepository,
    private readonly config: ConfigService
  ) {}

  async enqueueInbound(signature: string, payload: unknown) {
    try {
      const providerEventId = this.deriveEventId(payload);
      await this.whatsappRepo.upsertWebhookEvent(
        {
          provider: "whatsapp",
          providerEventId,
          payload: { signature, payload }
        },
        { provider_providerEventId: { provider: "whatsapp", providerEventId } }
      );
      await this.queue.add("process", { providerEventId }, {
        jobId: providerEventId,
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 }
      });
      return { queued: true, providerEventId };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("[WhatsAppService.enqueueInbound] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to enqueue WhatsApp message.");
    }
  }

  async sendText(organizationId: string, to: string, text: string) {
    try {
      const account = await this.whatsappRepo.upsertWhatsAppAccount(
        organizationId,
        this.config.get<string>("META_WHATSAPP_PHONE_NUMBER_ID") ?? ""
      );
      const phoneNumberId = account.phoneNumberId;
      const accessToken = this.config.get<string>("META_WHATSAPP_ACCESS_TOKEN");

      if (!phoneNumberId || !accessToken) {
        console.warn("[WhatsAppService.sendText] WhatsApp not configured for org", organizationId);
        return;
      }

      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text }
        })
      });

      const body = await res.json();
      if (!res.ok) {
        console.error("[WhatsAppService.sendText] Meta API error:", body);
        return;
      }

      const contact = await this.whatsappRepo.upsertContact(organizationId, account.id, to);
      const conversation = await this.whatsappRepo.findOrCreateConversation(organizationId, contact.id);
      await this.whatsappRepo.createMessage({
        organizationId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        providerMsgId: body.messages?.[0]?.id,
        text
      });
    } catch (err) {
      console.error("[WhatsAppService.sendText] Unexpected error:", err);
    }
  }

  private deriveEventId(payload: unknown) {
    const text = JSON.stringify(payload);
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(index);
      hash |= 0;
    }
    return `wa-${Math.abs(hash)}`;
  }
}
