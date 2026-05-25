import { Body, Controller, Headers, Post } from "@nestjs/common";
import { PaymentsService } from "./payments.service";

@Controller({ path: "payments", version: "1" })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("paystack/webhook")
  paystackWebhook(@Headers("x-paystack-signature") signature: string, @Body() payload: unknown) {
    return this.paymentsService.handlePaystackWebhook(signature, payload);
  }
}
