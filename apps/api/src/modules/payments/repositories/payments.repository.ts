import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createProviderEvent(data: {
    provider: "PAYSTACK" | "FLUTTERWAVE" | "MANUAL";
    providerEventId: string;
    payload: unknown;
  }) {
    return this.prisma.paymentProviderEvent.create({
      data: {
        provider: data.provider,
        providerEventId: data.providerEventId,
        payload: data.payload as any
      }
    });
  }
}
