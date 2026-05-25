import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { DebtsService } from "./debts.service";

@Controller({ path: "debts", version: "1" })
@UseGuards(JwtAuthGuard, TenantGuard)
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get()
  list(@CurrentTenant() tenant: { organizationId: string }) {
    return this.debtsService.list(tenant.organizationId);
  }

  @Get("summary")
  summary(@CurrentTenant() tenant: { organizationId: string }) {
    return this.debtsService.summary(tenant.organizationId);
  }
}
