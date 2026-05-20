import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreateProductDto, StockMutationDto } from "./dto/inventory.dto";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(organizationId: string, pagination: PaginationDto) {
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { organizationId, isActive: true },
        orderBy: { name: "asc" },
        skip,
        take: pagination.pageSize
      }),
      this.prisma.product.count({ where: { organizationId, isActive: true } })
    ]);
    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  createProduct(organizationId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        organizationId,
        name: dto.name,
        sku: dto.sku,
        barcode: dto.barcode,
        unit: dto.unit ?? "unit",
        costPrice: dto.costPrice ?? 0,
        sellingPrice: dto.sellingPrice ?? 0,
        lowStockLevel: dto.lowStockLevel ?? 5
      }
    });
  }

  async getStockLevel(organizationId: string, productId: string) {
    const batches = await this.prisma.productBatch.groupBy({
      by: ["branchId"],
      where: { organizationId, productId },
      _sum: { quantity: true }
    });
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
      const transaction = await tx.inventoryTransaction.create({
        data: {
          organizationId,
          productId: dto.productId,
          branchId: dto.branchId,
          type: dto.type,
          quantity: signedQuantity,
          note: dto.note,
          idempotencyKey: dto.idempotencyKey
        }
      });

      const existingBatch = await tx.productBatch.findFirst({
        where: { organizationId, productId: dto.productId, branchId: dto.branchId, batchNumber: null }
      });

      if (existingBatch) {
        await tx.productBatch.update({
          where: { id: existingBatch.id },
          data: { quantity: { increment: signedQuantity } }
        });
      } else {
        await tx.productBatch.create({
          data: {
            organizationId,
            productId: dto.productId,
            branchId: dto.branchId,
            quantity: signedQuantity
          }
        });
      }

      await tx.inventoryAuditLog.create({
        data: {
          organizationId,
          productId: dto.productId,
          action: dto.type,
          metadata: { transactionId: transaction.id, quantity: signedQuantity }
        }
      });

      return transaction;
    });
  }

  async lowStock(organizationId: string) {
    const products = await this.prisma.product.findMany({
      where: { organizationId, isActive: true },
      include: { batches: true }
    });
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
