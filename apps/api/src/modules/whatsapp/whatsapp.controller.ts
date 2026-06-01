import { Body, Controller, Get, Headers, Post, Query, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsAppService } from "./whatsapp.service";

@Controller({ path: "whatsapp", version: "1" })
export class WhatsAppController {
  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsAppService
  ) {}

  @Get("webhook")
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string
  ) {
    if (mode === "subscribe" && token === this.config.get<string>("META_WHATSAPP_VERIFY_TOKEN")) {
      return challenge;
    }
    return "verification failed";
  }

  @Post("webhook")
  receive(@Headers("x-hub-signature-256") signature: string, @Body() payload: any) {
    const msg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const text = msg?.text?.body;
    if (text) {
      Logger.log(`[WhatsApp] Inbound from ${msg.from}: "${text}"`);
    }
    return this.whatsapp.enqueueInbound(signature, payload);
  }
}

