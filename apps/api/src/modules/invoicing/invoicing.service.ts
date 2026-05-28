import { HttpException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { InvoicingRepository } from "./repositories/invoicing.repository";

type CreateInvoiceInput = {
  customerId?: string;
  items: { productId?: string; name: string; quantity: number; unitPrice: number }[];
};

@Injectable()
export class InvoicingService {
  constructor(private readonly invoicingRepo: InvoicingRepository) {}

  async list(organizationId: string) {
    try {
      return await this.invoicingRepo.findManyByOrg(organizationId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InvoicingService.list] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve invoices.");
    }
  }

  async createDraft(organizationId: string, input: CreateInvoiceInput) {
    try {
      const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
      return await this.invoicingRepo.create({
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
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InvoicingService.createDraft] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to create invoice draft.");
    }
  }
}

