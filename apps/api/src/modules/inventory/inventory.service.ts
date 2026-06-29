import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../../prisma/prisma.service";
import { InventoryRepository } from "./repositories/inventory.repository";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreateProductDto, StockMutationDto } from "./dto/inventory.dto";

type ImportedProductRow = {
  name: string;
  sellingPrice: number;
  initialQuantity: number;
  rowNumber: number;
};

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
      return {
        items: items.map(({ batches, ...product }) => ({
          ...product,
          quantity: batches.reduce((sum, batch) => sum + batch.quantity, 0)
        })),
        total,
        page: pagination.page,
        pageSize: pagination.pageSize
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InventoryService.listProducts] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve products.");
    }
  }

  async listBranches(organizationId: string) {
    return this.prisma.branch.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true }
    });
  }

  async createProduct(organizationId: string, dto: CreateProductDto) {
    try {
      const name = dto.name?.trim();
      if (!name) throw new BadRequestException("Product name is required.");
      const initialQuantity = dto.initialQuantity ?? 0;
      if (initialQuantity > 0) {
        const branch = await this.prisma.branch.findFirst({
          where: { organizationId },
          orderBy: { createdAt: "asc" }
        });
        if (!branch) throw new BadRequestException("Cannot add opening stock because no branch exists.");
      }

      return await this.prisma.$transaction(async (tx) => {
        const sku = dto.sku?.trim() || await this.generateSku(organizationId, name, tx);
        const product = await tx.product.create({
          data: {
            organization: { connect: { id: organizationId } },
            name,
            sku,
            barcode: dto.barcode,
            unit: dto.unit ?? "unit",
            costPrice: dto.costPrice ?? 0,
            sellingPrice: dto.sellingPrice ?? 0,
            lowStockLevel: dto.lowStockLevel ?? 5
          }
        });

        if (initialQuantity <= 0) return product;

        const branch = await tx.branch.findFirst({
          where: { organizationId },
          orderBy: { createdAt: "asc" }
        });
        if (!branch) throw new BadRequestException("Cannot add opening stock because no branch exists.");

        const transaction = await this.inventoryRepo.createTransaction({
          organizationId,
          productId: product.id,
          branchId: branch.id,
          type: "STOCK_IN",
          quantity: initialQuantity,
          note: "Opening stock"
        }, tx);

        await this.inventoryRepo.createBatch({
          organizationId,
          productId: product.id,
          branchId: branch.id,
          quantity: initialQuantity
        }, tx);

        await this.inventoryRepo.createAuditLog({
          organizationId,
          productId: product.id,
          action: "STOCK_IN",
          metadata: { transactionId: transaction.id, quantity: initialQuantity, source: "opening_stock" }
        }, tx);

        return product;
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

  private async generateSku(organizationId: string, name: string, tx: Prisma.TransactionClient) {
    const prefix = name.normalize("NFKD").replace(/[^a-zA-Z0-9\s]/g, "").trim()
      .split(/\s+/).map((word) => word.slice(0, 3)).join("").slice(0, 9).toUpperCase() || "PRD";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const sku = `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const exists = await tx.product.findFirst({ where: { organizationId, sku }, select: { id: true } });
      if (!exists) return sku;
    }
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  async deleteZeroStockProducts(organizationId: string) {
    try {
      const products = await this.prisma.product.findMany({
        where: { organizationId, isActive: true },
        include: { batches: true }
      });
      const zeroStockProducts = products.filter((product) => {
        const quantity = product.batches.reduce((sum, batch) => sum + batch.quantity, 0);
        return quantity <= 0;
      });

      if (zeroStockProducts.length === 0) {
        return { count: 0, products: [] as Array<{ id: string; name: string }> };
      }

      await this.prisma.product.updateMany({
        where: {
          organizationId,
          id: { in: zeroStockProducts.map((product) => product.id) }
        },
        data: { isActive: false }
      });

      return {
        count: zeroStockProducts.length,
        products: zeroStockProducts.map((product) => ({ id: product.id, name: product.name }))
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InventoryService.deleteZeroStockProducts] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to delete zero-stock products.");
    }
  }

  async importProductsFromSpreadsheet(
    organizationId: string,
    file: { buffer: Buffer; originalname?: string; mimetype?: string }
  ) {
    try {
      if (!file?.buffer?.length) {
        throw new BadRequestException("Spreadsheet file is required.");
      }

      const rows = this.parseProductSpreadsheet(file.buffer);
      if (rows.length === 0) {
        throw new BadRequestException("No valid products found. Use columns: product name, price, quantity.");
      }

      const branch = await this.prisma.branch.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "asc" }
      });
      if (!branch) throw new BadRequestException("Cannot import stock because no branch exists.");

      const result = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as string[]
      };

      for (const row of rows) {
        try {
          const existing = await this.prisma.product.findFirst({
            where: {
              organizationId,
              name: { equals: row.name, mode: "insensitive" },
              isActive: true
            }
          });

          if (existing) {
            await this.prisma.$transaction(async (tx) => {
              const product = await tx.product.update({
                where: { id: existing.id },
                data: { sellingPrice: row.sellingPrice }
              });

              if (row.initialQuantity <= 0) return;

              const transaction = await this.inventoryRepo.createTransaction({
                organizationId,
                productId: product.id,
                branchId: branch.id,
                type: "STOCK_IN",
                quantity: row.initialQuantity,
                note: "Spreadsheet import"
              }, tx);

              const existingBatch = await this.inventoryRepo.findBatch(
                organizationId,
                product.id,
                branch.id,
                tx
              );
              if (existingBatch) {
                await this.inventoryRepo.updateBatch(
                  existingBatch.id,
                  { quantity: { increment: row.initialQuantity } },
                  tx
                );
              } else {
                await this.inventoryRepo.createBatch({
                  organizationId,
                  productId: product.id,
                  branchId: branch.id,
                  quantity: row.initialQuantity
                }, tx);
              }

              await this.inventoryRepo.createAuditLog({
                organizationId,
                productId: product.id,
                action: "STOCK_IN",
                metadata: { transactionId: transaction.id, quantity: row.initialQuantity, source: "spreadsheet_import" }
              }, tx);
            });
            result.updated += 1;
          } else {
            await this.createProduct(organizationId, {
              name: row.name,
              sellingPrice: row.sellingPrice,
              initialQuantity: row.initialQuantity
            });
            result.created += 1;
          }
        } catch (error) {
          result.skipped += 1;
          result.errors.push(`Row ${row.rowNumber}: failed to import "${row.name}"`);
          Logger.warn(`[InventoryService.importProductsFromSpreadsheet] Row ${row.rowNumber} failed`, error as Error);
        }
      }

      return {
        ...result,
        totalProcessed: result.created + result.updated,
        filename: file.originalname ?? null
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[InventoryService.importProductsFromSpreadsheet] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to import products.");
    }
  }

  async recordTransaction(organizationId: string, dto: StockMutationDto) {
    try {
      if (dto.quantity === 0) throw new BadRequestException("Quantity cannot be zero");
      const signedQuantity = ["STOCK_OUT", "SALE", "TRANSFER"].includes(dto.type)
        ? -Math.abs(dto.quantity)
        : Math.abs(dto.quantity);

      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { name: true, sellingPrice: true }
      });
      if (!product) throw new BadRequestException("Product not found.");

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

        if (signedQuantity < 0) {
          // Outflow (SALE/STOCK_OUT/TRANSFER): decrement atomically with a
          // conditional write so two concurrent sales can never oversell. The
          // `quantity >= needed` guard is evaluated at write time under the
          // row lock, so a count of 0 means there isn't enough stock.
          const needed = -signedQuantity;
          if (!existingBatch) {
            throw new BadRequestException("Insufficient stock for this product at the selected branch.");
          }
          const decremented = await tx.productBatch.updateMany({
            where: { id: existingBatch.id, quantity: { gte: needed } },
            data: { quantity: { decrement: needed } }
          });
          if (decremented.count === 0) {
            throw new BadRequestException("Insufficient stock for this product at the selected branch.");
          }
        } else if (existingBatch) {
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

        if (dto.type === "SALE") {
          await tx.payment.create({
            data: {
              organizationId,
              amount: product.sellingPrice.mul(dto.quantity),
              currency: "NGN",
              provider: "MANUAL",
              paidAt: new Date(),
              metadata: {
                transactionId: transaction.id,
                productId: dto.productId,
                productName: product.name,
                quantity: dto.quantity
              }
            }
          });
        }

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

  private parseProductSpreadsheet(buffer: Buffer): ImportedProductRow[] {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const worksheet = workbook.Sheets[sheetName];
    const table = XLSX.utils.sheet_to_json<Array<string | number | null>>(worksheet, {
      header: 1,
      raw: false,
      blankrows: false
    });
    const rows = table.filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0));
    if (rows.length === 0) return [];

    const header = rows[0].map((cell) => this.normalizeHeader(cell));
    const hasHeader = header.some((cell) => ["name", "product", "productname", "item", "itemname"].includes(cell));
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const indexes = hasHeader
      ? {
          name: this.findHeaderIndex(header, ["name", "product", "productname", "item", "itemname"]),
          price: this.findHeaderIndex(header, ["price", "sellingprice", "unitprice", "amount"]),
          quantity: this.findHeaderIndex(header, ["quantity", "qty", "stock", "stockcount", "initialquantity"])
        }
      : { name: 0, price: 1, quantity: 2 };

    if (indexes.name < 0) {
      throw new BadRequestException("Could not find a product name column.");
    }

    const parsed: ImportedProductRow[] = [];
    dataRows.forEach((row, index) => {
      const rowNumber = hasHeader ? index + 2 : index + 1;
      const name = String(row[indexes.name] ?? "").trim();
      const sellingPrice = this.parseImportNumber(row[indexes.price]);
      const initialQuantity = Math.floor(this.parseImportNumber(row[indexes.quantity]));

      if (!name) return;
      if (sellingPrice < 0 || initialQuantity < 0) return;

      parsed.push({ name, sellingPrice, initialQuantity, rowNumber });
    });

    return parsed;
  }

  private normalizeHeader(value: unknown) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  private findHeaderIndex(headers: string[], candidates: string[]) {
    return headers.findIndex((header) => candidates.includes(header));
  }

  private parseImportNumber(value: unknown) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

