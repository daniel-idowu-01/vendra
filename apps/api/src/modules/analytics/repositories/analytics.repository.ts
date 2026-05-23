import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTodayPayments(organizationId: string, today: Date) {
    return this.prisma.payment.findMany({
      where: { organizationId, paidAt: { gte: today } }
    });
  }

  findActiveProductsWithBatches(organizationId: string) {
    return this.prisma.product.findMany({
      where: { organizationId, isActive: true },
      include: { batches: true }
    });
  }

  findOpenDebts(organizationId: string) {
    return this.prisma.debtRecord.findMany({
      where: { organizationId, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] as any } }
    });
  }
}
