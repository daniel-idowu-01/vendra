import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { CustomersController } from "./customers.controller";

@Module({
  imports: [JwtModule.register({})],
  controllers: [CustomersController]
})
export class CustomersModule {}
