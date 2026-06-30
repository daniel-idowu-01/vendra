import { HttpException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { PaymentsRepository } from "./repositories/payments.repository";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly config: ConfigService
  ) {}

  /**
   * Paystack signs each webhook with HMAC-SHA512 of the raw request body using
   * the account secret key. Reject anything that doesn't match.
   */
  verifyPaystackSignature(signature: string | undefined, rawBody: Buffer | undefined) {
    const secret = this.config.get<string>("PAYSTACK_SECRET_KEY");
    if (!secret) {
      Logger.error("[PaymentsService.verifyPaystackSignature] PAYSTACK_SECRET_KEY is not configured — rejecting webhook");
      throw new InternalServerErrorException("Webhook verification is not configured");
    }

    const expected = createHmac("sha512", secret)
      .update(rawBody ?? Buffer.alloc(0))
      .digest("hex");

    const a = Buffer.from(signature ?? "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  async handlePaystackWebhook(payload: unknown) {
    try {
      const providerEventId =
        typeof payload === "object" && payload && "event" in payload
          ? `${String((payload as { event: unknown }).event)}-${Date.now()}`
          : `paystack-${Date.now()}`;
      return await this.paymentsRepo.createProviderEvent({
        provider: "PAYSTACK",
        providerEventId,
        payload: { payload }
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[PaymentsService.handlePaystackWebhook] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to process payment webhook.");
    }
  }
}
