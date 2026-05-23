import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AiRepository } from "./repositories/ai.repository";

@Module({
  providers: [AiService, AiRepository],
  exports: [AiService]
})
export class AiModule {}
