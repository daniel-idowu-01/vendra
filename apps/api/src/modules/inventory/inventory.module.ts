import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService]
})
export class InventoryModule {}
