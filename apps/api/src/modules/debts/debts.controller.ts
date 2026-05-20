import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { PrismaService } from "../../prisma/prisma.service";

@Controller({ path: "debts", version: "1" })
@UseGuards(JwtAuthGuard, TenantGuard)
export class DebtsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentTenant() tenant: { organizationId: string }) {
    return this.prisma.debtRecord.findMany({
      where: { organizationId: tenant.organizationId },
      include: { customer: true, payments: true },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 100
    });
  }

  @Get("summary")
  async summary(@CurrentTenant() tenant: { organizationId: string }) {
    const debts = await this.prisma.debtRecord.findMany({
      where: { organizationId: tenant.organizationId, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { customer: true }
    });
    return {
      outstanding: debts.reduce((sum, debt) => sum + Number(debt.outstanding), 0),
      count: debts.length,
      topDebtors: debts
        .sort((a, b) => Number(b.outstanding) - Number(a.outstanding))
        .slice(0, 5)
        .map((debt) => ({ customer: debt.customer.name, outstanding: debt.outstanding, dueDate: debt.dueDate }))
    };
  }
}
