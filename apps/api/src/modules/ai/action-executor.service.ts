import { Injectable } from "@nestjs/common";
import { AnalyticsService } from "../analytics/analytics.service";
import { CustomersService } from "../customers/customers.service";
import { DebtsService } from "../debts/debts.service";
import { InventoryService } from "../inventory/inventory.service";
import { type ProposedAction } from "./ai.service";

@Injectable()
export class ActionExecutorService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly debts: DebtsService,
    private readonly analytics: AnalyticsService,
    private readonly customers: CustomersService,
  ) {}

  async execute(organizationId: string, action: ProposedAction): Promise<string> {
    const { toolName, parameters, response } = action;

    try {
      switch (toolName) {
        case "getStockLevel": {
          const productId = parameters.productId as string | undefined;
          if (!productId) {
            const products = await this.inventory.listProducts(organizationId, { page: 1, pageSize: 100 });
            return `📦 *Product List*\n${products.items.slice(0, 10).map((p: any) => `• ${p.name} (SKU: ${p.sku ?? "N/A"}) - $${p.sellingPrice}`).join("\n")}\n\nReply with the product name to check stock.`;
          }
          const stock = await this.inventory.getStockLevel(organizationId, productId);
          return `📊 *Stock Level*\nTotal: ${stock.total} units\n${stock.byBranch.map((b: any) => `Branch: ${b.quantity}`).join("\n")}`;
        }

        case "listProducts": {
          const products = await this.inventory.listProducts(organizationId, { page: 1, pageSize: 25 });
          if (products.items.length === 0) return "No products found in your inventory.";
          const lines = products.items.map((p: any, i: number) =>
            `${i + 1}. ${p.name} — $${p.sellingPrice} (${p.unit})`
          );
          return `📦 *Products (${products.total} total)*\n${lines.join("\n")}`;
        }

        case "lowStockAlert": {
          const lowStock = await this.inventory.lowStock(organizationId);
          if (lowStock.length === 0) return "✅ All products are well-stocked. No low stock alerts.";
          return `⚠️ *Low Stock Alerts*\n${lowStock.map((p: any) => `• ${p.name}: ${p.quantity} left (threshold: ${p.lowStockLevel})`).join("\n")}`;
        }

        case "listTopDebtors": {
          const summary = await this.debts.summary(organizationId);
          if (summary.count === 0) return "🎉 No open debts. All customers are up to date!";
          const lines = summary.topDebtors.map((d: any, i: number) =>
            `${i + 1}. ${d.customer} — $${Number(d.outstanding).toFixed(2)} (due ${new Date(d.dueDate).toLocaleDateString()})`
          );
          return `💰 *Debt Summary*\nTotal outstanding: $${Number(summary.outstanding).toFixed(2)}\n${lines.join("\n")}`;
        }

        case "debtSummary": {
          const debts = await this.debts.list(organizationId);
          if (debts.length === 0) return "No debt records found.";
          const total = debts.reduce((s: number, d: any) => s + Number(d.outstanding), 0);
          return `📋 *All Debts (${debts.length} records)*\nOutstanding total: $${total.toFixed(2)}\n\nTop: ${debts.slice(0, 5).map((d: any) => `${d.customer.name}: $${Number(d.outstanding).toFixed(2)}`).join("\n")}`;
        }

        case "todaySales": {
          const dash = await this.analytics.dashboard(organizationId);
          return `📈 *Today's Overview*\nSales: $${Number(dash.todaySales).toFixed(2)}\nDebts: $${Number(dash.openDebt).toFixed(2)}\nLow stock items: ${dash.lowStockCount}\n\n${dash.insights.join("\n")}`;
        }

        case "listCustomers": {
          const list = await this.customers.list(organizationId);
          if (list.length === 0) return "No customers registered yet.";
          const lines = list.map((c: any) => `• ${c.name}${c.phone ? ` (${c.phone})` : ""}`);
          return `👥 *Customers (${list.length} total)*\n${lines.join("\n")}`;
        }

        default:
          return response;
      }
    } catch (error) {
      console.error(`[ActionExecutorService.execute] Error executing ${toolName}:`, error);
      return "Sorry, I ran into an error while processing your request. Please try again.";
    }
  }
}
