import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { InventoryModule } from "../inventory/inventory.module";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppProcessor } from "./whatsapp.processor";
import { WhatsAppService } from "./whatsapp.service";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";

@Module({
  imports: [BullModule.registerQueue({ name: "whatsapp-inbound" }), AiModule, InventoryModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppProcessor, WhatsAppRepository]
})
export class WhatsAppModule {}
