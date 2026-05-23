import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { InvoicingService } from "./invoicing.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";

@Controller({ path: "invoices", version: "1" })
@UseGuards(JwtAuthGuard, TenantGuard)
export class InvoicingController {
  constructor(private readonly invoicing: InvoicingService) {}

  @Get()
  list(@CurrentTenant() tenant: { organizationId: string }) {
    return this.invoicing.list(tenant.organizationId);
  }

  @Post()
  create(@CurrentTenant() tenant: { organizationId: string }, @Body() dto: CreateInvoiceDto) {
    return this.invoicing.createDraft(tenant.organizationId, dto);
  }
}
