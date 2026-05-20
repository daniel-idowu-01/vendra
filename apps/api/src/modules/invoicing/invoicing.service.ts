import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type CreateInvoiceInput = {
  customerId?: string;
  items: { productId?: string; name: string; quantity: number; unitPrice: number }[];
};

@Injectable()
export class InvoicingService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.invoice.findMany({
      where: { organizationId },
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  async createDraft(organizationId: string, input: CreateInvoiceInput) {
    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.invoice.create({
      data: {
        organizationId,
        customerId: input.customerId,
        invoiceNumber,
        subtotal,
        totalAmount: subtotal,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.quantity * item.unitPrice
          }))
        }
      },
      include: { items: true, customer: true }
    });
  }
}
