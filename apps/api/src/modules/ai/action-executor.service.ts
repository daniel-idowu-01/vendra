import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { CustomersService } from "../customers/customers.service";
import { DebtsService } from "../debts/debts.service";
import { InventoryService } from "../inventory/inventory.service";
import { type ProposedAction } from "./ai.service";

@Injectable()
export class ActionExecutorService {
  constructor(
    private readonly prisma: PrismaService,
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
            return `📦 *Product List*\n${products.items.slice(0, 10).map((p: any) => `• ${p.name} (SKU: ${p.sku ?? "N/A"}) - ₦${Number(p.sellingPrice).toLocaleString()}`).join("\n")}\n\nReply with the product name to check stock.`;
          }
          const stock = await this.inventory.getStockLevel(organizationId, productId);
          return `📊 *Stock Level*\nTotal: ${stock.total} units\n${stock.byBranch.map((b: any) => `Branch: ${b.quantity}`).join("\n")}`;
        }

        case "listProducts": {
          const products = await this.inventory.listProducts(organizationId, { page: 1, pageSize: 25 });
          if (products.items.length === 0) return "No products found in your inventory.";
          const lines = products.items.map((p: any, i: number) =>
            `${i + 1}. ${p.name} — ₦${Number(p.sellingPrice).toLocaleString()} (${p.unit})`
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
            `${i + 1}. ${d.customer} — ₦${Number(d.outstanding).toLocaleString()} (due ${new Date(d.dueDate).toLocaleDateString()})`
          );
          return `💰 *Debt Summary*\nTotal outstanding: ₦${Number(summary.outstanding).toLocaleString()}\n${lines.join("\n")}`;
        }

        case "debtSummary": {
          const debts = await this.debts.list(organizationId);
          if (debts.length === 0) return "No debt records found.";
          const total = debts.reduce((s: number, d: any) => s + Number(d.outstanding), 0);
          return `📋 *All Debts (${debts.length} records)*\nOutstanding total: ₦${total.toLocaleString()}\n\nTop: ${debts.slice(0, 5).map((d: any) => `${d.customer.name}: ₦${Number(d.outstanding).toLocaleString()}`).join("\n")}`;
        }

        case "todaySales": {
          const dash = await this.analytics.dashboard(organizationId);
          return `📈 *Today's Overview*\nSales: ₦${Number(dash.todaySales).toLocaleString()}\nDebts: ₦${Number(dash.openDebt).toLocaleString()}\nLow stock items: ${dash.lowStockCount}\n\n${dash.insights.join("\n")}`;
        }

        case "listCustomers": {
          const list = await this.customers.list(organizationId);
          if (list.length === 0) return "No customers registered yet.";
          const lines = list.map((c: any) => `• ${c.name}${c.phone ? ` (${c.phone})` : ""}`);
          return `👥 *Customers (${list.length} total)*\n${lines.join("\n")}`;
        }
        case "createCustomer": {
          const name = this.extractName(parameters) ?? "New Customer";
          const phone = this.extractPhone(parameters);
          const customer = await this.customers.create(organizationId, { name, phone, whatsappPhone: phone });
          return `Customer created: ${customer.name}${customer.phone ? ` (${customer.phone})` : ""}.`;
        }
        case "createProduct": {
          const name = this.extractName(parameters) ?? "New Product";
          const price = this.extractAmount(parameters) ?? 0;
          const product = await this.inventory.createProduct(organizationId, { name, sellingPrice: price, unit: "unit" });
          return `Product created: ${product.name} at ₦${Number(product.sellingPrice).toLocaleString()}.`;
        }
        case "recordDebt": {
          const customerName = this.extractName(parameters) ?? "Customer";
          const amount = this.extractAmount(parameters) ?? 0;
          let customer = await this.prisma.customer.findFirst({ where: { organizationId, name: customerName } });
          if (!customer) {
            customer = await this.prisma.customer.create({ data: { organizationId, name: customerName } });
          }
          await this.prisma.debtRecord.create({
            data: {
              organizationId,
              customerId: customer.id,
              originalAmount: amount,
              outstanding: amount,
              status: "OPEN"
            }
          });
          return `Debt recorded for ${customer.name}: ₦${amount.toLocaleString()}.`;
        }
        case "recordSale": {
          const source = String(parameters.items ?? parameters.sourceText ?? "");
          const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
          const branch = await this.prisma.branch.findFirst({ where: { organizationId }, orderBy: { createdAt: "asc" } });
          if (!branch) return "I could not record the sale because no branch exists yet.";
          let total = 0;
          let recorded = 0;
          for (const line of lines) {
            const parsed = line.match(/(\d+)\s+(.+?)\s+(?:for|@)\s*([\d,]+(?:\.\d+)?)/i);
            if (!parsed) continue;
            const qty = Number(parsed[1]);
            const name = parsed[2].trim();
            const unitPrice = Number(parsed[3].replace(/,/g, ""));
            let product = await this.prisma.product.findFirst({ where: { organizationId, name } });
            if (!product) {
              product = await this.prisma.product.create({
                data: { organizationId, name, sellingPrice: unitPrice, unit: "unit", lowStockLevel: 5 }
              });
            } else if (product.sellingPrice.toString() !== unitPrice.toString()) {
              product = await this.prisma.product.update({
                where: { id: product.id },
                data: { sellingPrice: unitPrice }
              });
            }
            await this.inventory.recordTransaction(organizationId, {
              productId: product.id,
              branchId: branch.id,
              type: "SALE",
              quantity: qty,
              note: `WhatsApp AI sale: ${line}`
            });
            recorded += 1;
            total += qty * unitPrice;
          }
          if (recorded === 0) return "I could not parse sale lines. Use format: `1 White shirt for 10000`.";
          return `Sale recorded: ${recorded} item line(s), total ₦${total.toLocaleString()}.`;
        }

        default:
          return response;
      }
    } catch (error) {
      console.error(`[ActionExecutorService.execute] Error executing ${toolName}:`, error);
      return "Sorry, I ran into an error while processing your request. Please try again.";
    }
  }

  private extractAmount(parameters: Record<string, unknown>): number | null {
    const fromParam = parameters.amount;
    if (typeof fromParam === "number") return fromParam;
    if (typeof fromParam === "string") return this.parseNumber(fromParam);
    const source = String(parameters.sourceText ?? parameters.items ?? "");
    return this.parseNumber(source);
  }

  private extractName(parameters: Record<string, unknown>): string | null {
    const source = String(parameters.sourceText ?? parameters.items ?? "");
    if (source) {
      const match = source.match(/^(\w+)/);
      if (match) return match[1];
    }
    if (typeof parameters.customerName === "string") return parameters.customerName;
    if (typeof parameters.name === "string") return parameters.name;
    return null;
  }

  private extractPhone(parameters: Record<string, unknown>): string | undefined {
    const source = String(parameters.sourceText ?? "");
    const match = source.match(/(?:\+?\d[\d\s-]{7,}\d)/);
    return match ? match[0].replace(/\s|-/g, "") : undefined;
  }

  private parseNumber(input: string): number | null {
    const cleaned = input.replace(/,/g, "");
    const match = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    return Number(match[1]);
  }
}
