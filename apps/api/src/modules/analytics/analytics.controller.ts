import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { AnalyticsService } from "./analytics.service";

@Controller({ path: "analytics", version: "1" })
@UseGuards(JwtAuthGuard, TenantGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("dashboard")
  dashboard(@CurrentTenant() tenant: { organizationId: string }) {
    return this.analytics.dashboard(tenant.organizationId);
  }
}
