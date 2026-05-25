import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./common/config/env.validation";
import { QueuesModule } from "./modules/queues/queues.module";
import { AiModule } from "./modules/ai/ai.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DebtsModule } from "./modules/debts/debts.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { InvoicingModule } from "./modules/invoicing/invoicing.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { WhatsAppModule } from "./modules/whatsapp/whatsapp.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("REDIS_URL") }
      })
    }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    InventoryModule,
    CustomersModule,
    InvoicingModule,
    DebtsModule,
    PaymentsModule,
    WhatsAppModule,
    AiModule,
    AnalyticsModule,
    QueuesModule
  ]
})
export class AppModule {}
