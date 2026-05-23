import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class WhatsAppRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertWebhookEvent(data: {
    provider: string;
    providerEventId: string;
    payload: unknown;
  }, where: { provider_providerEventId: { provider: string; providerEventId: string } }) {
    return this.prisma.webhookEvent.upsert({
      where,
      update: {},
      create: {
        provider: data.provider,
        providerEventId: data.providerEventId,
        payload: data.payload as any
      }
    });
  }

  findWebhookEvent(provider: string, providerEventId: string) {
    return this.prisma.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider, providerEventId } }
    });
  }

  markWebhookEventProcessed(id: string) {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: { processedAt: new Date() }
    });
  }

  findFirstOrganization() {
    return this.prisma.organization.findFirst();
  }
}
