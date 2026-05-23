import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { InventoryRepository } from "./repositories/inventory.repository";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreateProductDto, StockMutationDto } from "./dto/inventory.dto";

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventoryRepo: InventoryRepository,
    private readonly prisma: PrismaService
  ) {}

  async listProducts(organizationId: string, pagination: PaginationDto) {
    const [items, total] = await this.prisma.$transaction([
      this.inventoryRepo.findProductsByOrg(organizationId, pagination),
      this.inventoryRepo.countProductsByOrg(organizationId)
    ]);
    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  createProduct(organizationId: string, dto: CreateProductDto) {
    return this.inventoryRepo.createProduct({
      organization: { connect: { id: organizationId } },
      name: dto.name,
      sku: dto.sku,
      barcode: dto.barcode,
      unit: dto.unit ?? "unit",
      costPrice: dto.costPrice ?? 0,
      sellingPrice: dto.sellingPrice ?? 0,
      lowStockLevel: dto.lowStockLevel ?? 5
    });
  }

  async getStockLevel(organizationId: string, productId: string) {
    const batches = await this.inventoryRepo.groupBatchesByBranch(organizationId, productId);
    return {
      productId,
      total: batches.reduce((sum, row) => sum + (row._sum.quantity ?? 0), 0),
      byBranch: batches.map((row) => ({ branchId: row.branchId, quantity: row._sum.quantity ?? 0 }))
    };
  }

  async recordTransaction(organizationId: string, dto: StockMutationDto) {
    if (dto.quantity === 0) throw new BadRequestException("Quantity cannot be zero");
    const signedQuantity = ["STOCK_OUT", "SALE", "TRANSFER"].includes(dto.type)
      ? -Math.abs(dto.quantity)
      : Math.abs(dto.quantity);

    return this.prisma.$transaction(async (tx) => {
      const transaction = await this.inventoryRepo.createTransaction({
        organizationId,
        productId: dto.productId,
        branchId: dto.branchId,
        type: dto.type,
        quantity: signedQuantity,
        note: dto.note,
        idempotencyKey: dto.idempotencyKey
      }, tx);

      const existingBatch = await this.inventoryRepo.findBatch(
        organizationId, dto.productId, dto.branchId, tx
      );

      if (existingBatch) {
        await this.inventoryRepo.updateBatch(
          existingBatch.id,
          { quantity: { increment: signedQuantity } },
          tx
        );
      } else {
        await this.inventoryRepo.createBatch({
          organizationId,
          productId: dto.productId,
          branchId: dto.branchId,
          quantity: signedQuantity
        }, tx);
      }

      await this.inventoryRepo.createAuditLog({
        organizationId,
        productId: dto.productId,
        action: dto.type,
        metadata: { transactionId: transaction.id, quantity: signedQuantity }
      }, tx);

      return transaction;
    });
  }

  async lowStock(organizationId: string) {
    const products = await this.inventoryRepo.findProductsWithBatches(organizationId);
    return products
      .map((product) => ({
        id: product.id,
        name: product.name,
        lowStockLevel: product.lowStockLevel,
        quantity: product.batches.reduce((sum, batch) => sum + batch.quantity, 0)
      }))
      .filter((product) => product.quantity <= product.lowStockLevel);
  }
}
