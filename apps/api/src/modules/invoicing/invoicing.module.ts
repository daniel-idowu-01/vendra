import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { InvoicingController } from "./invoicing.controller";
import { InvoicingService } from "./invoicing.service";
import { InvoicingRepository } from "./repositories/invoicing.repository";

@Module({
  imports: [JwtModule.register({})],
  controllers: [InvoicingController],
  providers: [InvoicingService, InvoicingRepository],
  exports: [InvoicingService]
})
export class InvoicingModule {}
