import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Controller({ path: "customers", version: "1" })
@UseGuards(JwtAuthGuard, TenantGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(@CurrentTenant() tenant: { organizationId: string }) {
    return this.customersService.list(tenant.organizationId);
  }

  @Post()
  create(@CurrentTenant() tenant: { organizationId: string }, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(tenant.organizationId, dto);
  }
}
