import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DebtsController } from "./debts.controller";

@Module({
  imports: [JwtModule.register({})],
  controllers: [DebtsController]
})
export class DebtsModule {}
