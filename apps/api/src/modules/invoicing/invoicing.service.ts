import { Injectable } from "@nestjs/common";
import { InvoicingRepository } from "./repositories/invoicing.repository";

type CreateInvoiceInput = {
  customerId?: string;
  items: { productId?: string; name: string; quantity: number; unitPrice: number }[];
};

@Injectable()
export class InvoicingService {
  constructor(private readonly invoicingRepo: InvoicingRepository) {}

  list(organizationId: string) {
    return this.invoicingRepo.findManyByOrg(organizationId);
  }

  async createDraft(organizationId: string, input: CreateInvoiceInput) {
    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
    return this.invoicingRepo.create({
      organization: { connect: { id: organizationId } },
      ...(input.customerId ? { customer: { connect: { id: input.customerId } } } : {}),
      invoiceNumber,
      subtotal,
      totalAmount: subtotal,
      items: {
        create: input.items.map((item) => ({
          ...(item.productId ? { product: { connect: { id: item.productId } } } : {}),
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.quantity * item.unitPrice
        }))
      }
    });
  }
}
