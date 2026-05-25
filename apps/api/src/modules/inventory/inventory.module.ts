import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryRepository } from "./repositories/inventory.repository";

@Module({
  imports: [JwtModule.register({})],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository],
  exports: [InventoryService]
})
export class InventoryModule {}
