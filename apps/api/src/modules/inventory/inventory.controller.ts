import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentTenant, TenantContext } from "../../common/decorators/current-tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { PaginationDto } from "../../common/pagination/pagination.dto";
import { CreateProductDto, StockMutationDto } from "./dto/inventory.dto";
import { InventoryService } from "./inventory.service";

@Controller({ path: "inventory", version: "1" })
@UseGuards(JwtAuthGuard, TenantGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("products")
  listProducts(@CurrentTenant() tenant: TenantContext, @Query() pagination: PaginationDto) {
    return this.inventory.listProducts(tenant.organizationId, pagination);
  }

  @Post("products")
  createProduct(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateProductDto) {
    return this.inventory.createProduct(tenant.organizationId, dto);
  }

  @Get("products/:id/stock")
  getStock(@CurrentTenant() tenant: TenantContext, @Param("id") productId: string) {
    return this.inventory.getStockLevel(tenant.organizationId, productId);
  }

  @Post("transactions")
  mutateStock(@CurrentTenant() tenant: TenantContext, @Body() dto: StockMutationDto) {
    return this.inventory.recordTransaction(tenant.organizationId, dto);
  }

  @Get("alerts/low-stock")
  lowStock(@CurrentTenant() tenant: TenantContext) {
    return this.inventory.lowStock(tenant.organizationId);
  }
}
