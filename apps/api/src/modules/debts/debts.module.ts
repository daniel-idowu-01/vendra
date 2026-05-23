import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DebtsController } from "./debts.controller";
import { DebtsService } from "./debts.service";
import { DebtsRepository } from "./repositories/debts.repository";

@Module({
  imports: [JwtModule.register({})],
  controllers: [DebtsController],
  providers: [DebtsService, DebtsRepository]
})
export class DebtsModule {}
