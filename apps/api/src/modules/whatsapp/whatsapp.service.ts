import { InjectQueue } from "@nestjs/bullmq";
import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { Queue } from "bullmq";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";

@Injectable()
export class WhatsAppService {
  constructor(
    @InjectQueue("whatsapp-inbound") private readonly queue: Queue,
    private readonly whatsappRepo: WhatsAppRepository
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
