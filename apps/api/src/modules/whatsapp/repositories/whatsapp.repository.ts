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

  upsertWhatsAppAccount(organizationId: string, phoneNumberId: string) {
    return this.prisma.whatsAppAccount.upsert({
      where: { phoneNumberId },
      update: {},
      create: { organizationId, phoneNumberId }
    });
  }

  upsertContact(organizationId: string, whatsappAccountId: string, phone: string, displayName?: string) {
    return this.prisma.whatsAppContact.upsert({
      where: { organizationId_phone: { organizationId, phone } },
      update: { displayName: displayName ?? undefined },
      create: { organizationId, whatsappAccountId, phone, displayName: displayName ?? null }
    });
  }

  async findOrCreateConversation(organizationId: string, contactId: string) {
    let conversation = await this.prisma.conversation.findFirst({
      where: { organizationId, contactId }
    });
    if (conversation) {
      return this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() }
      });
    }
    return this.prisma.conversation.create({
      data: { organizationId, contactId, lastMessageAt: new Date() }
    });
  }

  createMessage(data: {
    organizationId: string;
    conversationId: string;
    direction: "INBOUND" | "OUTBOUND";
    providerMsgId?: string;
    text?: string;
    mediaUrl?: string;
  }) {
    const { organizationId, conversationId, direction, ...rest } = data;
    return this.prisma.message.create({
      data: {
        organizationId,
        conversationId,
        direction,
        ...rest
      }
    });
  }
}
