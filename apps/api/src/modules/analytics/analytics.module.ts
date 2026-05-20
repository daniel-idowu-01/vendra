import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AnalyticsController } from "./analytics.controller";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AnalyticsController]
})
export class AnalyticsModule {}
