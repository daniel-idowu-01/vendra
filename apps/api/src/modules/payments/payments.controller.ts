import { Body, Controller, Headers, Post, Req, RawBodyRequest } from "@nestjs/common";
import { Request } from "express";
import { PaymentsService } from "./payments.service";

@Controller({ path: "payments", version: "1" })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("paystack/webhook")
  paystackWebhook(
    @Headers("x-paystack-signature") signature: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: unknown
  ) {
    // Reject forged events before recording anything.
    this.paymentsService.verifyPaystackSignature(signature, req.rawBody);
    return this.paymentsService.handlePaystackWebhook(payload);
  }
}
