import { InjectQueue } from "@nestjs/bullmq";
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { createHmac, timingSafeEqual } from "crypto";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";

@Injectable()
export class WhatsAppService {
  constructor(
    @InjectQueue("whatsapp-inbound") private readonly queue: Queue,
    private readonly whatsappRepo: WhatsAppRepository,
    private readonly config: ConfigService
  ) {}

  /**
   * Verify the `x-hub-signature-256` header against the raw request body using
   * the Meta app secret (HMAC-SHA256). Throws on any mismatch so forged
   * webhooks can never reach the queue or trigger AI write actions.
   */
  verifySignature(signature: string | undefined, rawBody: Buffer | undefined) {
    const appSecret = this.config.get<string>("META_WHATSAPP_APP_SECRET");
    if (!appSecret) {
      Logger.error(
        "[WhatsAppService.verifySignature] META_WHATSAPP_APP_SECRET is not configured — rejecting webhook"
      );
      throw new InternalServerErrorException("Webhook verification is not configured");
    }

    const expected =
      "sha256=" +
      createHmac("sha256", appSecret)
        .update(rawBody ?? Buffer.alloc(0))
        .digest("hex");

    const provided = signature ?? "";
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  async enqueueInbound(payload: unknown) {
    try {
      // Use the actual WhatsApp message ID as the idempotency key.
      // Fall back to a hash only if the message ID is absent (status updates, etc.)
      const providerEventId = this.extractMessageId(payload) ?? this.hashPayload(payload);

      await this.whatsappRepo.upsertWebhookEvent(
        { provider: "whatsapp", providerEventId, payload: { payload } },
        { provider_providerEventId: { provider: "whatsapp", providerEventId } }
      );

      await this.queue.add("process", { providerEventId }, {
        jobId: providerEventId,   // BullMQ deduplication
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
      });

      return { queued: true, providerEventId };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[WhatsAppService.enqueueInbound] Unexpected error:", error);
      throw new InternalServerErrorException(
        "Failed to enqueue WhatsApp message."
      );
    }
  }

  async sendText(organizationId: string, to: string, text: string): Promise<void> {
    try {
      const account = await this.whatsappRepo.upsertWhatsAppAccount(
        organizationId,
        this.config.get<string>("META_WHATSAPP_PHONE_NUMBER_ID") ?? ""
      );
      const { phoneNumberId } = account;
      const accessToken = this.config.get<string>("META_WHATSAPP_ACCESS_TOKEN");

      if (!phoneNumberId || !accessToken) {
        Logger.warn(
          `[WhatsAppService.sendText] WhatsApp not configured for org ${organizationId}`
        );
        return;
      }

      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      });

      const body = (await res.json()) as { messages?: Array<{ id?: string }> };
      if (!res.ok) {
        Logger.error("[WhatsAppService.sendText] Meta API error:", body);
        return;
      }

      const contact = await this.whatsappRepo.upsertContact(
        organizationId,
        account.id,
        to
      );
      const conversation = await this.whatsappRepo.findOrCreateConversation(
        organizationId,
        contact.id
      );
      await this.whatsappRepo.createMessage({
        organizationId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        providerMsgId: body.messages?.[0]?.id,
        text,
      });
    } catch (err) {
      Logger.error("[WhatsAppService.sendText] Unexpected error:", err);
    }
  }

  /**
   * Send a one-off text without any tenant persistence. Used to reply to
   * inbound messages from numbers that are not linked to a workspace, where we
   * have no organization to attribute the message to.
   */
  async sendRawText(phoneNumberId: string, to: string, text: string): Promise<void> {
    try {
      const accessToken = this.config.get<string>("META_WHATSAPP_ACCESS_TOKEN");
      if (!phoneNumberId || !accessToken) return;

      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      });
      if (!res.ok) {
        Logger.error("[WhatsAppService.sendRawText] Meta API error:", await res.text());
      }
    } catch (err) {
      Logger.error("[WhatsAppService.sendRawText] Unexpected error:", err);
    }
  }

  async downloadMedia(mediaId: string): Promise<Buffer | null> {
    const accessToken = this.config.get<string>("META_WHATSAPP_ACCESS_TOKEN");
    if (!accessToken) {
      Logger.warn(
        "[WhatsAppService.downloadMedia] Access token not configured"
      );
      return null;
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta = (await metaRes.json()) as { url?: string };
    if (!metaRes.ok || !meta?.url) {
      Logger.error(
        "[WhatsAppService.downloadMedia] Metadata fetch failed:",
        meta
      );
      return null;
    }

    const mediaRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!mediaRes.ok) {
      Logger.error(
        "[WhatsAppService.downloadMedia] Download failed:",
        await mediaRes.text()
      );
      return null;
    }

    return Buffer.from(await mediaRes.arrayBuffer());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

// Extract the WhatsApp-provided message ID from the webhook payload.
  private extractMessageId(payload: unknown): string | null {
    try {
      const p = payload as {
        entry?: Array<{
          changes?: Array<{
            value?: { messages?: Array<{ id?: string }> };
          }>;
        }>;
      };
      const id = p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
      return id ? `wa-${id}` : null;
    } catch {
      return null;
    }
  }

  // Fallback hash for non-message webhooks (status updates, etc.)
  private hashPayload(payload: unknown): string {
    const text = JSON.stringify(payload);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
    return `wa-hash-${hash}`;
  }
}