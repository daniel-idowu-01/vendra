import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { AnalyticsRepository } from "./repositories/analytics.repository";

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepo: AnalyticsRepository) {}

  async dashboard(organizationId: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [payments, products, debts] = await Promise.all([
        this.analyticsRepo.findTodayPayments(organizationId, today),
        this.analyticsRepo.findActiveProductsWithBatches(organizationId),
        this.analyticsRepo.findOpenDebts(organizationId)
      ]);

      const lowStockProducts = products
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
          lowStockProducts.length > 0
            ? `${lowStockProducts.length} products are almost finished.`
            : "Stock levels look stable today.",
          debts.length > 0
            ? `${debts.length} customers have open debt records.`
            : "No open customer debts found."
        ]
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("[AnalyticsService.dashboard] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to generate dashboard analytics.");
    }
  }
}
