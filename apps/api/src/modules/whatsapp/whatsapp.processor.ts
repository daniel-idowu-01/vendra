import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AiService } from "../ai/ai.service";
import { PrismaService } from "../../prisma/prisma.service";

@Processor("whatsapp-inbound")
export class WhatsAppProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService
  ) {
    super();
  }

  async process(job: Job<{ providerEventId: string }>) {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider: "whatsapp", providerEventId: job.data.providerEventId } }
    });
    if (!event) return;

    const organization = await this.prisma.organization.findFirst();
    if (!organization) {
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
      return;
    }

    const text = this.extractText(event.payload);
    if (text) {
      await this.ai.proposeAction(organization.id, text);
    }
    await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  }

  private extractText(payload: unknown): string | undefined {
    const serialized = JSON.stringify(payload);
    const match = serialized.match(/"body"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }
}
