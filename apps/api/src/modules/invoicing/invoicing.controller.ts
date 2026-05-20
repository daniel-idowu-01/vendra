import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { InvoicingService } from "./invoicing.service";

class InvoiceItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  name!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;
}

class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}

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
