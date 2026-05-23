import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class InvoicingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByOrg(organizationId: string) {
    return this.prisma.invoice.findMany({
      where: { organizationId },
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  create(data: Prisma.InvoiceCreateInput) {
    return this.prisma.invoice.create({
      data,
      include: { items: true, customer: true }
    });
  }
}
