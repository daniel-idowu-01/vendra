import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { PrismaService } from "../../prisma/prisma.service";

@Controller({ path: "analytics", version: "1" })
@UseGuards(JwtAuthGuard, TenantGuard)
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("dashboard")
  async dashboard(@CurrentTenant() tenant: { organizationId: string }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [payments, lowStock, debts] = await Promise.all([
      this.prisma.payment.findMany({ where: { organizationId: tenant.organizationId, paidAt: { gte: today } } }),
      this.prisma.product.findMany({ where: { organizationId: tenant.organizationId, isActive: true }, include: { batches: true } }),
      this.prisma.debtRecord.findMany({ where: { organizationId: tenant.organizationId, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } } })
    ]);

    const lowStockProducts = lowStock
      .map((product) => ({
        name: product.name,
        quantity: product.batches.reduce((sum, batch) => sum + batch.quantity, 0),
        threshold: product.lowStockLevel
      }))
      .filter((product) => product.quantity <= product.threshold);

    return {
      todaySales: payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      openDebt: debts.reduce((sum, debt) => sum + Number(debt.outstanding), 0),
      lowStockCount: lowStockProducts.length,
      insights: [
        lowStockProducts.length > 0 ? `${lowStockProducts.length} products are almost finished.` : "Stock levels look stable today.",
        debts.length > 0 ? `${debts.length} customers have open debt records.` : "No open customer debts found."
      ]
    };
  }
}
