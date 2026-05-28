import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
    try {
      const [items, total] = await this.prisma.$transaction([
        this.inventoryRepo.findProductsByOrg(organizationId, pagination),
        this.inventoryRepo.countProductsByOrg(organizationId)
      ]);
      return { items, total, page: pagination.page, pageSize: pagination.pageSize };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InventoryService.listProducts] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve products.");
    }
  }

  async createProduct(organizationId: string, dto: CreateProductDto) {
    try {
      const name = dto.name?.trim();
      if (!name) throw new BadRequestException("Product name is required.");
      return await this.inventoryRepo.createProduct({
        organization: { connect: { id: organizationId } },
        name,
        sku: dto.sku,
        barcode: dto.barcode,
        unit: dto.unit ?? "unit",
        costPrice: dto.costPrice ?? 0,
        sellingPrice: dto.sellingPrice ?? 0,
        lowStockLevel: dto.lowStockLevel ?? 5
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException("A product with the same unique details already exists.");
        }
        if (error.code === "P2003") {
          throw new BadRequestException("Invalid product relationship data.");
        }
      }
      Logger.error("[InventoryService.createProduct] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to create product.");
    }
  }

  async getStockLevel(organizationId: string, productId: string) {
    try {
      const batches = await this.inventoryRepo.groupBatchesByBranch(organizationId, productId);
      return {
        productId,
        total: batches.reduce((sum, row) => sum + (row._sum.quantity ?? 0), 0),
        byBranch: batches.map((row) => ({ branchId: row.branchId, quantity: row._sum.quantity ?? 0 }))
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InventoryService.getStockLevel] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve stock level.");
    }
  }

  async recordTransaction(organizationId: string, dto: StockMutationDto) {
    try {
      if (dto.quantity === 0) throw new BadRequestException("Quantity cannot be zero");
      const signedQuantity = ["STOCK_OUT", "SALE", "TRANSFER"].includes(dto.type)
        ? -Math.abs(dto.quantity)
        : Math.abs(dto.quantity);

      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InventoryService.recordTransaction] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to record inventory transaction.");
    }
  }

  async lowStock(organizationId: string) {
    try {
      const products = await this.inventoryRepo.findProductsWithBatches(organizationId);
      return products
        .map((product) => ({
          id: product.id,
          name: product.name,
          lowStockLevel: product.lowStockLevel,
          quantity: product.batches.reduce((sum, batch) => sum + batch.quantity, 0)
        }))
        .filter((product) => product.quantity <= product.lowStockLevel);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InventoryService.lowStock] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve low stock alerts.");
    }
  }
}

