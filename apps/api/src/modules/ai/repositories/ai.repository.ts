import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
    status: string;
    validation?: Record<string, unknown>;
  }) {
    return this.prisma.aiAction.create({
      data: {
        organizationId: data.organizationId,
        aiSessionId: data.aiSessionId ?? null,
        toolName: data.toolName,
        input: data.input as unknown as Prisma.InputJsonValue,
        confidence: data.confidence,
        status: data.status as any,
        validation: data.validation as unknown as Prisma.InputJsonValue
      }
    });
  }
}
