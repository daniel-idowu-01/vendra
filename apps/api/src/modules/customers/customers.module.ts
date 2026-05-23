import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { CustomersRepository } from "./repositories/customers.repository";

@Module({
  imports: [JwtModule.register({})],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersRepository]
})
export class CustomersModule {}
