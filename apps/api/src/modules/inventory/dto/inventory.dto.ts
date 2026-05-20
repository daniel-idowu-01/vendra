import { IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockLevel?: number;
}

export class StockMutationDto {
  @IsString()
  productId!: string;

  @IsString()
  branchId!: string;

  @IsString()
  type!: "STOCK_IN" | "STOCK_OUT" | "SALE" | "RETURN" | "ADJUSTMENT" | "TRANSFER";

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
