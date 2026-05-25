import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class DebtsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByOrg(organizationId: string) {
    return this.prisma.debtRecord.findMany({
      where: { organizationId },
      include: { customer: true, payments: true },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 100
    });
  }

  findOpenDebtsByOrg(organizationId: string) {
    return this.prisma.debtRecord.findMany({
      where: { organizationId, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] as any } },
      include: { customer: true }
    });
  }
}
