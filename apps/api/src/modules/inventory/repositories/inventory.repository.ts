import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { PaginationDto } from "../../../common/pagination/pagination.dto";

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  findProductsByOrg(organizationId: string, pagination: PaginationDto) {
    const skip = (pagination.page - 1) * pagination.pageSize;
    return this.prisma.product.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: "asc" },
      skip,
      take: pagination.pageSize
    });
  }

  countProductsByOrg(organizationId: string) {
    return this.prisma.product.count({ where: { organizationId, isActive: true } });
  }

  createProduct(data: {
    organization: { connect: { id: string } };
    name: string;
    sku?: string | null;
    barcode?: string | null;
    unit: string;
    costPrice: number;
    sellingPrice: number;
    lowStockLevel: number;
  }) {
    return this.prisma.product.create({ data });
  }

  findProductsWithBatches(organizationId: string) {
    return this.prisma.product.findMany({
      where: { organizationId, isActive: true },
      include: { batches: true }
    });
  }

  groupBatchesByBranch(organizationId: string, productId: string) {
    return this.prisma.productBatch.groupBy({
      by: ["branchId"],
      where: { organizationId, productId },
      _sum: { quantity: true }
    });
  }

  findBatch(organizationId: string, productId: string, branchId: string, tx?: Prisma.TransactionClient) {
    return this.db(tx).productBatch.findFirst({
      where: { organizationId, productId, branchId, batchNumber: null }
    });
  }

  createBatch(data: {
    organizationId: string;
    productId: string;
    branchId: string;
    quantity: number;
  }, tx?: Prisma.TransactionClient) {
    return this.db(tx).productBatch.create({ data });
  }

  updateBatch(id: string, data: { quantity: { increment: number } }, tx?: Prisma.TransactionClient) {
    return this.db(tx).productBatch.update({ where: { id }, data });
  }

  createTransaction(data: {
    organizationId: string;
    productId: string;
    branchId: string;
    type: string;
    quantity: number;
    note?: string | null;
    idempotencyKey?: string | null;
  }, tx?: Prisma.TransactionClient) {
    return this.db(tx).inventoryTransaction.create({
      data: {
        organizationId: data.organizationId,
        productId: data.productId,
        branchId: data.branchId,
        type: data.type as any,
        quantity: data.quantity,
        note: data.note,
        idempotencyKey: data.idempotencyKey
      }
    });
  }

  createAuditLog(data: {
    organizationId: string;
    productId: string;
    action: string;
    metadata: Record<string, unknown>;
  }, tx?: Prisma.TransactionClient) {
    return this.db(tx).inventoryAuditLog.create({
      data: {
        organizationId: data.organizationId,
        productId: data.productId,
        action: data.action,
        metadata: data.metadata as any
      }
    });
  }
}
