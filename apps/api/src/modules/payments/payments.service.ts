import { Injectable } from "@nestjs/common";
import { PaymentsRepository } from "./repositories/payments.repository";

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepo: PaymentsRepository) {}

  async handlePaystackWebhook(signature: string, payload: unknown) {
    const providerEventId =
      typeof payload === "object" && payload && "event" in payload
        ? `${String((payload as { event: unknown }).event)}-${Date.now()}`
        : `paystack-${Date.now()}`;
    return this.paymentsRepo.createProviderEvent({
      provider: "PAYSTACK",
      providerEventId,
      payload: { signature, payload }
    });
  }
}
