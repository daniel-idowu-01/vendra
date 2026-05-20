import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { PrismaService } from "../../prisma/prisma.service";

class CreateCustomerDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;
}

@Controller({ path: "customers", version: "1" })
@UseGuards(JwtAuthGuard, TenantGuard)
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentTenant() tenant: { organizationId: string }) {
    return this.prisma.customer.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: { name: "asc" },
      take: 100
    });
  }

  @Post()
  create(@CurrentTenant() tenant: { organizationId: string }, @Body() dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: { organizationId: tenant.organizationId, ...dto }
    });
  }
}
