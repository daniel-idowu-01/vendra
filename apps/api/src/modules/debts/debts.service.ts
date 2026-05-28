import { HttpException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { DebtsRepository } from "./repositories/debts.repository";

@Injectable()
export class DebtsService {
  constructor(private readonly debtsRepo: DebtsRepository) {}

  async list(organizationId: string) {
    try {
      return await this.debtsRepo.findManyByOrg(organizationId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[DebtsService.list] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve debts.");
    }
  }

  async summary(organizationId: string) {
    try {
      const debts = await this.debtsRepo.findOpenDebtsByOrg(organizationId);
      return {
        outstanding: debts.reduce((sum, debt) => sum + Number(debt.outstanding), 0),
        count: debts.length,
        topDebtors: debts
          .sort((a, b) => Number(b.outstanding) - Number(a.outstanding))
          .slice(0, 5)
          .map((debt) => ({
            customer: debt.customer.name,
            outstanding: debt.outstanding,
            dueDate: debt.dueDate
          }))
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[DebtsService.summary] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve debt summary.");
    }
  }
}

