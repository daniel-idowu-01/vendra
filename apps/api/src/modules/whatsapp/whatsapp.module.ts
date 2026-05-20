import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppProcessor } from "./whatsapp.processor";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  imports: [BullModule.registerQueue({ name: "whatsapp-inbound" }), AiModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppProcessor]
})
export class WhatsAppModule {}
