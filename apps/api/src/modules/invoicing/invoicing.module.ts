import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { InvoicingController } from "./invoicing.controller";
import { InvoicingService } from "./invoicing.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService]
})
export class InvoicingModule {}
