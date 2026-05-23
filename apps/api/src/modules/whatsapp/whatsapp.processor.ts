import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AiService } from "../ai/ai.service";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";

@Processor("whatsapp-inbound")
export class WhatsAppProcessor extends WorkerHost {
  constructor(
    private readonly whatsappRepo: WhatsAppRepository,
    private readonly ai: AiService
  ) {
    super();
  }

  async process(job: Job<{ providerEventId: string }>) {
    try {
      const event = await this.whatsappRepo.findWebhookEvent("whatsapp", job.data.providerEventId);
      if (!event) return;

      const organization = await this.whatsappRepo.findFirstOrganization();
      if (!organization) {
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const text = this.extractText(event.payload);
      if (text) {
        await this.ai.proposeAction(organization.id, text);
      }
      await this.whatsappRepo.markWebhookEventProcessed(event.id);
    } catch (error) {
      console.error("[WhatsAppProcessor.process] Unexpected error:", error);
    }
  }

  private extractText(payload: unknown): string | undefined {
    const serialized = JSON.stringify(payload);
    const match = serialized.match(/"body"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }
}
