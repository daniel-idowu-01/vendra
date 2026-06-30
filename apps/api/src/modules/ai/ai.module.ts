import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { CustomersModule } from "../customers/customers.module";
import { DebtsModule } from "../debts/debts.module";
import { InventoryModule } from "../inventory/inventory.module";
import { InvoicingModule } from "../invoicing/invoicing.module";
import { ActionExecutorService } from "./action-executor.service";
import { AiService } from "./ai.service";
import { AiRepository } from "./repositories/ai.repository";

@Module({
  imports: [InventoryModule, DebtsModule, AnalyticsModule, CustomersModule, InvoicingModule],
  providers: [AiService, ActionExecutorService, AiRepository],
  exports: [AiService, ActionExecutorService, AiRepository]
})
export class AiModule {}
