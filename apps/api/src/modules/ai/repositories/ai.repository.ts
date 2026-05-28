import { Injectable } from "@nestjs/common";
import { AiActionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class AiRepository {
  constructor(private readonly prisma: PrismaService) {}

  createIntent(data: {
    organizationId: string;
    name: string;
    confidence: number;
    input: string;
  }) {
    return this.prisma.aiIntent.create({ data });
  }

  createAction(data: {
    organizationId: string;
    aiSessionId?: string | null;
    toolName: string;
    input: Record<string, unknown>;
    confidence: number;
    status: AiActionStatus;
    validation?: Record<string, unknown>;
  }) {
    return this.prisma.aiAction.create({
      data: {
        organizationId: data.organizationId,
        aiSessionId: data.aiSessionId ?? null,
        toolName: data.toolName,
        input: data.input as unknown as Prisma.InputJsonValue,
        confidence: data.confidence,
        status: data.status,
        validation: data.validation as unknown as Prisma.InputJsonValue
      }
    });
  }

  findLatestPendingActionForConversation(organizationId: string, conversationId: string) {
    return this.prisma.aiAction.findFirst({
      where: {
        organizationId,
        status: AiActionStatus.NEEDS_CONFIRMATION,
        session: { conversationId }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  updateActionStatus(id: string, status: AiActionStatus, result?: Record<string, unknown>) {
    return this.prisma.aiAction.update({
      where: { id },
      data: {
        status,
        executedAt: status === "EXECUTED" || status === "FAILED" ? new Date() : undefined,
        result: result as unknown as Prisma.InputJsonValue
      }
    });
  }

  async findOrCreateSession(organizationId: string, conversationId?: string) {
    const existing = await this.prisma.aiSession.findFirst({
      where: { organizationId, conversationId: conversationId ?? null },
      orderBy: { createdAt: "desc" }
    });
    if (existing) return existing;
    return this.prisma.aiSession.create({
      data: { organizationId, conversationId: conversationId ?? null }
    });
  }

  createAiMessage(data: { aiSessionId: string; role: string; content: string }) {
    return this.prisma.aiMessage.create({ data });
  }

  findRecentMessages(aiSessionId: string, limit = 10) {
    return this.prisma.aiMessage.findMany({
      where: { aiSessionId },
      orderBy: { createdAt: "asc" },
      take: limit
    });
  }
}
