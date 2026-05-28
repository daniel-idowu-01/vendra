import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { CustomersService } from "../customers/customers.service";
import { DebtsService } from "../debts/debts.service";
import { InventoryService } from "../inventory/inventory.service";
import { type ProposedAction } from "./ai.service";

interface SaleItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

@Injectable()
export class ActionExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly debts: DebtsService,
    private readonly analytics: AnalyticsService,
    private readonly customers: CustomersService
  ) {}

  async execute(organizationId: string, action: ProposedAction): Promise<string> {
    const { toolName, parameters } = action;

    try {
      switch (toolName) {

        case "listProducts": {
          const products = await this.inventory.listProducts(organizationId, { page: 1, pageSize: 25 });
          if (products.items.length === 0) return "Your inventory is empty. Reply *add product [name] [price]* to add one.";
          const lines = products.items.map(
            (p: any, i: number) =>
              `${i + 1}. ${p.name} — ₦${Number(p.sellingPrice).toLocaleString("en-NG")} per ${p.unit ?? "unit"}`
          );
          return `📦 *Products (${products.total} total)*\n${lines.join("\n")}`;
        }

        case "getStockLevel": {
          // Prefer productId from parameters; fall back to name-based lookup
          let productId = parameters.productId as string | undefined;
          if (!productId && parameters.productName) {
            const found = await this.prisma.product.findFirst({
              where: {
                organizationId,
                name: { contains: String(parameters.productName), mode: "insensitive" }
              }
            });
            productId = found?.id;
          }

          if (!productId) {
            // No specific product identified — list all products so user can pick
            const products = await this.inventory.listProducts(organizationId, { page: 1, pageSize: 100 });
            if (products.items.length === 0) return "No products found.";
            const lines = products.items
              .slice(0, 15)
              .map((p: any) => `• ${p.name} (SKU: ${p.sku ?? "N/A"})`);
            return `📦 *Which product's stock do you want to check?*\n${lines.join("\n")}\n\nReply with the product name.`;
          }

          const stock = await this.inventory.getStockLevel(organizationId, productId);
          const branchLines = stock.byBranch.map((b: any) => `  • Branch: ${b.quantity} units`).join("\n");
          return `📊 *Stock Level*\nTotal: *${stock.total} units*\n${branchLines}`;
        }

        case "lowStockAlert": {
          const lowStock = await this.inventory.lowStock(organizationId);
          if (lowStock.length === 0) return "✅ All products are well-stocked!";
          const lines = lowStock.map(
            (p: any) => `⚠️ ${p.name}: *${p.quantity}* left (threshold: ${p.lowStockLevel})`
          );
          return `*Low Stock Alerts*\n${lines.join("\n")}`;
        }

        case "listTopDebtors": {
          const summary = await this.debts.summary(organizationId);
          if (summary.count === 0) return "🎉 No open debts. All customers are up to date!";
          const lines = summary.topDebtors.map(
            (d: any, i: number) =>
              `${i + 1}. ${d.customer} — ₦${Number(d.outstanding).toLocaleString("en-NG")}`
          );
          return `💰 *Debt Summary*\nTotal outstanding: *₦${Number(summary.outstanding).toLocaleString("en-NG")}*\n${lines.join("\n")}`;
        }

        case "debtSummary": {
          const debts = await this.debts.list(organizationId);
          if (debts.length === 0) return "No debt records found.";
          const total = debts.reduce((s: number, d: any) => s + Number(d.outstanding), 0);
          const lines = debts
            .slice(0, 10)
            .map((d: any) => `• ${d.customer.name}: ₦${Number(d.outstanding).toLocaleString("en-NG")}`);
          return `📋 *All Debts (${debts.length} records)*\nOutstanding total: *₦${total.toLocaleString("en-NG")}*\n${lines.join("\n")}`;
        }

        case "todaySales": {
          const dash = await this.analytics.dashboard(organizationId);
          const insights = dash.insights?.length ? `\n\n💡 ${dash.insights.join("\n💡 ")}` : "";
          return (
            `📈 *Today's Overview*\n` +
            `Sales: *₦${Number(dash.todaySales).toLocaleString("en-NG")}*\n` +
            `Open Debts: ₦${Number(dash.openDebt).toLocaleString("en-NG")}\n` +
            `Low stock items: ${dash.lowStockCount}` +
            insights
          );
        }

        case "listCustomers": {
          const list = await this.customers.list(organizationId);
          if (list.length === 0) return "No customers yet. Reply *add customer [name]* to add one.";
          const lines = list
            .slice(0, 20)
            .map((c: any) => `• ${c.name}${c.phone ? ` (${c.phone})` : ""}`);
          return `👥 *Customers (${list.length} total)*\n${lines.join("\n")}`;
        }

        // These are only reached AFTER the user has confirmed.

        case "createCustomer": {
          const name = this.requireString(parameters, ["name", "customerName"], "customer name");
          const phone = this.optionalString(parameters, ["phone"]);
          const customer = await this.customers.create(organizationId, {
            name,
            phone,
            whatsappPhone: phone
          });
          return `✅ *Customer added*\nName: ${customer.name}${customer.phone ? `\nPhone: ${customer.phone}` : ""}`;
        }

        case "createProduct": {
          const name = this.requireString(parameters, ["name", "productName"], "product name");
          const price = this.requireNumber(parameters, ["sellingPrice", "price", "amount"]) ?? 0;
          const unit = this.optionalString(parameters, ["unit"]) ?? "unit";
          const product = await this.inventory.createProduct(organizationId, {
            name,
            sellingPrice: price,
            unit
          });
          return (
            `✅ *Product created*\nName: ${product.name}\n` +
            `Price: ₦${Number(product.sellingPrice).toLocaleString("en-NG")} per ${product.unit}`
          );
        }

        case "recordDebt": {
          const customerName = this.requireString(parameters, ["customerName", "name"], "customer name");
          const amount = this.requireNumber(parameters, ["amount"]) ?? 0;

          if (amount <= 0) {
            return `⚠️ Could not record debt — amount must be greater than 0. Please try again with the amount.`;
          }

          let customer = await this.prisma.customer.findFirst({
            where: { organizationId, name: { equals: customerName, mode: "insensitive" } }
          });
          if (!customer) {
            customer = await this.prisma.customer.create({
              data: { organizationId, name: customerName }
            });
          }

          const debt = await this.prisma.debtRecord.create({
            data: {
              organizationId,
              customerId: customer.id,
              originalAmount: amount,
              outstanding: amount,
              status: "OPEN"
            }
          });

          return (
            `✅ *Debt recorded*\nCustomer: ${customer.name}\nAmount: ₦${amount.toLocaleString("en-NG")}\n` +
            `Debt ID: ${debt.id.slice(0, 8)}…`
          );
        }

        case "recordSale": {
          return await this.handleRecordSale(organizationId, parameters);
        }

        case "createInvoiceDraft": {
          // Placeholder — extend when invoice domain service is ready
          return (
            "🧾 Invoice drafting is coming soon. For now, you can record the sale and share the details with your customer manually."
          );
        }

        case "unknown":
        default:
          return action.response || "I'm not sure how to help with that. Try asking about products, sales, customers, or debts.";
      }
    } catch (error) {
      console.error(`[ActionExecutorService] Error executing "${toolName}":`, error);
      return "⚠️ Something went wrong while processing your request. Please try again in a moment.";
    }
  }

  // fallback free-text parsing.

  private async handleRecordSale(
    organizationId: string,
    parameters: Record<string, unknown>
  ): Promise<string> {
    const branch = await this.prisma.branch.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" }
    });
    if (!branch) {
      return "⚠️ Cannot record sale — no branch found. Please set up a branch first.";
    }

    // Prefer structured items array produced by AI
    let items: SaleItem[] = [];

    if (Array.isArray(parameters.items) && parameters.items.length > 0) {
      items = this.parseStructuredItems(parameters.items);
    } else {
      // Fall back to text parsing
      const source = String(parameters.sourceText ?? parameters.items ?? "");
      items = this.parseSaleText(source);
    }

    if (items.length === 0) {
      return (
        "⚠️ I couldn't understand the sale items. Please use the format:\n" +
        "`[qty] [product name] for [price]`\nExample: `2 White shirts for 5000`"
      );
    }

    let totalAmount = 0;
    const recordedLines: string[] = [];
    const errors: string[] = [];

    for (const item of items) {
      try {
        let product = await this.prisma.product.findFirst({
          where: { organizationId, name: { equals: item.name, mode: "insensitive" } }
        });

        if (!product) {
          product = await this.prisma.product.create({
            data: {
              organizationId,
              name: item.name,
              sellingPrice: item.unitPrice,
              unit: "unit",
              lowStockLevel: 5
            }
          });
        } else if (Number(product.sellingPrice) !== item.unitPrice && item.unitPrice > 0) {
          // Update price only if a new explicit price was provided
          product = await this.prisma.product.update({
            where: { id: product.id },
            data: { sellingPrice: item.unitPrice }
          });
        }

        await this.inventory.recordTransaction(organizationId, {
          productId: product.id,
          branchId: branch.id,
          type: "SALE",
          quantity: item.quantity,
          note: `WhatsApp sale`
        });

        const lineTotal = item.quantity * item.unitPrice;
        totalAmount += lineTotal;
        recordedLines.push(
          `• ${item.quantity}× ${product.name} @ ₦${item.unitPrice.toLocaleString("en-NG")} = ₦${lineTotal.toLocaleString("en-NG")}`
        );
      } catch (err) {
        console.error(`[ActionExecutorService] Failed to record sale item "${item.name}":`, err);
        errors.push(`  ✗ ${item.name} (failed)`);
      }
    }

    if (recordedLines.length === 0) {
      return "⚠️ Could not record any items. Please try again.";
    }

    // Create a single payment record for the whole transaction
    await this.prisma.payment.create({
      data: {
        organizationId,
        provider: "MANUAL",
        amount: totalAmount,
        paidAt: new Date(),
        metadata: { source: "whatsapp_ai", items: items as any }
      }
    });

    const errorBlock = errors.length > 0 ? `\n\n⚠️ Failed items:\n${errors.join("\n")}` : "";

    return (
      `✅ *Sale recorded*\n${recordedLines.join("\n")}\n\n` +
      `*Total: ₦${totalAmount.toLocaleString("en-NG")}*` +
      errorBlock
    );
  }

  
  private requireString(
    params: Record<string, unknown>,
    keys: string[],
    label: string
  ): string {
    for (const key of keys) {
      const val = params[key];
      if (typeof val === "string" && val.trim().length > 0) return val.trim();
    }
    // Last resort: extract from sourceText
    const source = String(params.sourceText ?? "");
    const match = source.match(/[A-Za-z][a-zA-Z\s]{1,30}/);
    if (match) return match[0].trim();
    throw new Error(`Missing required parameter: ${label}`);
  }

  private requireNumber(
    params: Record<string, unknown>,
    keys: string[]
  ): number | null {
    for (const key of keys) {
      const val = params[key];
      if (typeof val === "number" && !isNaN(val)) return val;
      if (typeof val === "string") {
        const n = parseFloat(val.replace(/,/g, ""));
        if (!isNaN(n)) return n;
      }
    }
    // Try extracting from sourceText
    const source = String(params.sourceText ?? "");
    const match = source.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  private optionalString(
    params: Record<string, unknown>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const val = params[key];
      if (typeof val === "string" && val.trim().length > 0) return val.trim();
    }
    return undefined;
  }

  
  private parseStructuredItems(raw: unknown[]): SaleItem[] {
    const items: SaleItem[] = [];
    for (const entry of raw) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const name =
        String(obj.name ?? obj.productName ?? obj.product ?? "").trim();
      const quantity =
        Number(obj.quantity ?? obj.qty ?? obj.count ?? 1);
      const unitPrice =
        Number(
          obj.unitPrice ?? obj.unit_price ?? obj.price ?? obj.sellingPrice ?? 0
        );
      if (name && quantity > 0) {
        items.push({ name, quantity, unitPrice });
      }
    }
    return items;
  }

  
  private parseSaleText(source: string): SaleItem[] {
    const items: SaleItem[] = [];
    const lines = source
      .split(/[\n,;]/)
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      // Pattern: qty name (for|@|at) price
      const match = line.match(
        /(?:sold\s+)?(\d+)\s+(.+?)\s+(?:for|@|at)\s*([\d,]+(?:\.\d+)?)/i
      );
      if (match) {
        const quantity = parseInt(match[1], 10);
        const name = match[2].trim();
        const unitPrice = parseFloat(match[3].replace(/,/g, ""));
        if (name && quantity > 0 && unitPrice >= 0) {
          items.push({ name, quantity, unitPrice });
        }
      }
    }
    return items;
  }
}
