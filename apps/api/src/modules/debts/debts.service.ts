import { Injectable } from "@nestjs/common";
import { DebtsRepository } from "./repositories/debts.repository";

@Injectable()
export class DebtsService {
  constructor(private readonly debtsRepo: DebtsRepository) {}

  list(organizationId: string) {
    return this.debtsRepo.findManyByOrg(organizationId);
  }

  async summary(organizationId: string) {
    const debts = await this.debtsRepo.findOpenDebtsByOrg(organizationId);
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
