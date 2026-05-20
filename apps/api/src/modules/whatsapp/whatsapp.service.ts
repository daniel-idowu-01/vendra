import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class WhatsAppService {
  constructor(
    @InjectQueue("whatsapp-inbound") private readonly queue: Queue,
    private readonly prisma: PrismaService
  ) {}

  async enqueueInbound(signature: string, payload: unknown) {
    const providerEventId = this.deriveEventId(payload);
    await this.prisma.webhookEvent.upsert({
      where: { provider_providerEventId: { provider: "whatsapp", providerEventId } },
      update: {},
      create: { provider: "whatsapp", providerEventId, payload: { signature, payload } }
    });
    await this.queue.add("process", { providerEventId }, { jobId: providerEventId, attempts: 5, backoff: { type: "exponential", delay: 5000 } });
    return { queued: true, providerEventId };
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
