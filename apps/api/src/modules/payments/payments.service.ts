import { HttpException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { PaymentsRepository } from "./repositories/payments.repository";

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepo: PaymentsRepository) {}

  async handlePaystackWebhook(signature: string, payload: unknown) {
    try {
      const providerEventId =
        typeof payload === "object" && payload && "event" in payload
          ? `${String((payload as { event: unknown }).event)}-${Date.now()}`
          : `paystack-${Date.now()}`;
      return await this.paymentsRepo.createProviderEvent({
        provider: "PAYSTACK",
        providerEventId,
        payload: { signature, payload }
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[PaymentsService.handlePaystackWebhook] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to process payment webhook.");
    }
  }
}

