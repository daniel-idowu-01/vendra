import { Body, Controller, Headers, Post } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller({ path: "payments", version: "1" })
export class PaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("paystack/webhook")
  async paystackWebhook(@Headers("x-paystack-signature") signature: string, @Body() payload: unknown) {
    const providerEventId =
      typeof payload === "object" && payload && "event" in payload
        ? `${String((payload as { event: unknown }).event)}-${Date.now()}`
        : `paystack-${Date.now()}`;
    return this.prisma.paymentProviderEvent.create({
      data: {
        provider: "PAYSTACK",
        providerEventId,
        payload: { signature, payload }
      }
    });
  }
}
