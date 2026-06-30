import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { CustomersService } from "../customers/customers.service";
import { DebtsService } from "../debts/debts.service";
import { InventoryService } from "../inventory/inventory.service";
import { type ProposedAction } from "./ai.service";

interface SaleItem {
  name: string;
  quantity: number;
  unitPrice?: number;
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
          if (products.items.length === 0) {
            return "Your inventory is empty. Reply *add product [name] [price] qty [stock count]* to add one.";
          }
          const lines = products.items.map(
            (p: any, i: number) =>
              `${i + 1}. ${p.name} — ₦${Number(p.sellingPrice).toLocaleString("en-NG")} per ${p.unit ?? "unit"} | Qty: ${Number(p.quantity ?? 0).toLocaleString("en-NG")}`
          );
          return `📦 *Products (${products.total} total)*\n${lines.join("\n")}`;
        }

        case "getStockLevel": {
          // Prefer productId from parameters; fall back to name-based lookup
          let productId = parameters.productId as string | undefined;
          const requestedName = String(parameters.productName ?? "").trim() ||
            this.extractAvailabilityProduct(String(parameters.sourceText ?? ""));
          let found: any = null;
          if (!productId && requestedName) {
            found = await this.prisma.product.findFirst({
              where: {
                organizationId,
                isActive: true,
                name: { contains: requestedName, mode: "insensitive" }
              }
            });
            productId = found?.id;
          }

          if (!productId) {
            // No specific product identified — list all products so user can pick
            const products = await this.inventory.listProducts(organizationId, { page: 1, pageSize: 100 });
            if (products.items.length === 0) return "No products found.";
            const lines = products.items
              .slice(0, 5)
              .map((p: any) => `• ${p.name} (SKU: ${p.sku})`);
            if (requestedName) {
              return `Sorry, we don't currently have *${requestedName}*.\n\nYou may like:\n${lines.join("\n")}`;
            }
            return `📦 *Which product's stock do you want to check?*\n${lines.join("\n")}\n\nReply with the product name.`;
          }

          const stock = await this.inventory.getStockLevel(organizationId, productId);
          const branchLines = stock.byBranch.map((b: any) => `  • Branch: ${b.quantity} units`).join("\n");
          const availability = stock.total > 0 ? "Yes, it is available." : "It is currently out of stock.";
          return `${availability}\n📦 *${found?.name ?? "Product"}*\nPrice: *₦${Number(found?.sellingPrice ?? 0).toLocaleString("en-NG")}*\nStock: *${stock.total} ${found?.unit ?? "units"}*${branchLines ? `\n${branchLines}` : ""}`;
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
          const parsedProduct = this.parseProductText(String(parameters.sourceText ?? ""));
          // Prefer explicit params (from the LLM); fall back to the text parser.
          // Use optionalNumber (not requireNumber) so we don't blindly grab the
          // first number in the sentence as the price — that's how "20 pieces"
          // became a ₦20 price.
          const name =
            this.optionalString(parameters, ["name", "productName"]) ?? parsedProduct.name;
          if (!name) {
            return "⚠️ I couldn't catch the product name. Try: *add product <name> <price> qty <count>* — e.g. *add product Black tee 20000 qty 20*.";
          }
          const price =
            this.optionalNumber(parameters, ["sellingPrice", "price", "amount"]) ??
            parsedProduct.price ??
            0;
          const initialQuantity =
            this.optionalNumber(parameters, ["initialQuantity", "quantity", "qty", "stockCount", "stock"]) ??
            parsedProduct.initialQuantity ??
            0;
          const unit = this.optionalString(parameters, ["unit"]) ?? "unit";
          const product = await this.inventory.createProduct(organizationId, {
            name,
            sellingPrice: price,
            unit,
            initialQuantity
          });
          return [
            `Product created: ${product.name}`,
            `Price: NGN ${Number(product.sellingPrice).toLocaleString("en-NG")} per ${product.unit}`,
            `Opening stock: ${initialQuantity.toLocaleString("en-NG")} ${product.unit}`
          ].join("\n");
        }

        case "deleteProduct": {
          const productName =
            this.optionalString(parameters, ["productName", "name"]) ??
            this.stripDeleteCommand(String(parameters.sourceText ?? ""));
          if (!productName) {
            return "Which product should I delete? Reply with the product name.";
          }

          const result = await this.inventory.deleteProductByName(organizationId, productName);
          if (result.status === "not_found") {
            return `I couldn't find a product named *${productName}*. Reply *show products* to see your list.`;
          }
          if (result.status === "ambiguous") {
            const lines = result.candidates
              .map((c) => `• ${c.name}${c.sku ? ` (SKU: ${c.sku})` : ""}`)
              .join("\n");
            return `More than one product matches *${productName}*. Which one?\n${lines}\n\nReply with the exact name.`;
          }
          return `🗑️ Deleted *${result.product.name}* from your inventory.`;
        }

        case "deleteZeroStockProducts": {
          const result = await this.inventory.deleteZeroStockProducts(organizationId);
          if (result.count === 0) {
            return "No active products with 0 quantity were found.";
          }

          const names = result.products
            .slice(0, 10)
            .map((product) => `• ${product.name}`)
            .join("\n");
          const extra = result.count > 10 ? `\n...and ${result.count - 10} more.` : "";
          return `Deleted ${result.count} product${result.count === 1 ? "" : "s"} with 0 quantity:\n${names}${extra}`;
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

        case "settleDebt": {
          const rawName = String(parameters.customerName ?? parameters.name ?? "").trim().toLowerCase();
          const rawSource = String(parameters.sourceText ?? "").trim().toLowerCase();
          const phraseMeansAll = (text: string) =>
            /\b(everyone|everybody|all|no one|nobody|none)\b/.test(text) ||
            (/\b(owes?|owing|debt|balance)\b/.test(text) && /\b(no one|nobody|none|all)\b/.test(text));
          const nameMeansAll = phraseMeansAll(rawName) || phraseMeansAll(rawSource);
          const settleAll = Boolean(parameters.settleAll) || nameMeansAll;
          if (settleAll) {
            const openDebts = await this.prisma.debtRecord.findMany({
              where: { organizationId, outstanding: { gt: 0 } }
            });
            if (openDebts.length === 0) return "✅ No outstanding debts to settle.";

            const totalOutstanding = openDebts.reduce((s, d) => s + Number(d.outstanding), 0);
            // All-or-nothing: clear every debt and log a payment for each, in one
            // transaction so a mid-way failure can't leave debts half-settled.
            await this.prisma.$transaction(async (tx) => {
              for (const debt of openDebts) {
                await tx.debtPayment.create({
                  data: {
                    organizationId,
                    debtRecordId: debt.id,
                    amount: debt.outstanding,
                    note: "Settled via WhatsApp (all debts)"
                  }
                });
                await tx.debtRecord.update({
                  where: { id: debt.id },
                  data: { outstanding: 0, status: "PAID" }
                });
              }
            });
            return `✅ *All debts settled*\nTotal cleared: ₦${totalOutstanding.toLocaleString("en-NG")}`;
          }

          const customerName = this.requireString(parameters, ["customerName", "name"], "customer name");
          const amount = this.requireNumber(parameters, ["amount"]);

          const customer = await this.prisma.customer.findFirst({
            where: { organizationId, name: { equals: customerName, mode: "insensitive" } }
          });
          if (!customer) return `No customer found for "${customerName}".`;

          const openDebts = await this.prisma.debtRecord.findMany({
            where: { organizationId, customerId: customer.id, outstanding: { gt: 0 } },
            orderBy: { createdAt: "asc" }
          });
          if (openDebts.length === 0) return `✅ ${customer.name} has no open debts.`;

          const totalOutstanding = openDebts.reduce((s, d) => s + Number(d.outstanding), 0);

          if (amount === null || amount >= totalOutstanding) {
            await this.prisma.$transaction(async (tx) => {
              for (const debt of openDebts) {
                await tx.debtPayment.create({
                  data: {
                    organizationId,
                    debtRecordId: debt.id,
                    amount: debt.outstanding,
                    note: "Settled via WhatsApp (full payment)"
                  }
                });
                await tx.debtRecord.update({
                  where: { id: debt.id },
                  data: { outstanding: 0, status: "PAID" }
                });
              }
            });
            return `✅ *Debt settled*\nCustomer: ${customer.name}\nAmount: ₦${totalOutstanding.toLocaleString("en-NG")}\nStatus: Fully paid`;
          }

          if (amount <= 0) {
            return "⚠️ Amount paid must be greater than 0.";
          }

          // Partial payment: apply across oldest debts first, recording a
          // DebtPayment for each portion, all within a single transaction.
          await this.prisma.$transaction(async (tx) => {
            let remaining = amount;
            for (const debt of openDebts) {
              if (remaining <= 0) break;
              const current = Number(debt.outstanding);
              const paid = Math.min(current, remaining);
              const nextOutstanding = current - paid;
              await tx.debtPayment.create({
                data: {
                  organizationId,
                  debtRecordId: debt.id,
                  amount: paid,
                  note: "Partial payment via WhatsApp"
                }
              });
              await tx.debtRecord.update({
                where: { id: debt.id },
                data: { outstanding: nextOutstanding, status: nextOutstanding <= 0 ? "PAID" : "PARTIALLY_PAID" }
              });
              remaining -= paid;
            }
          });

          const newOutstanding = Math.max(totalOutstanding - amount, 0);
          return `✅ *Debt payment recorded*\nCustomer: ${customer.name}\nPaid: ₦${amount.toLocaleString("en-NG")}\nOutstanding: ₦${newOutstanding.toLocaleString("en-NG")}`;
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
      Logger.error(`[ActionExecutorService] Error executing "${toolName}":`, error);
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
          errors.push(`  - ${item.name}: product not found. Add it with stock count first.`);
          continue;
        }

        const resolvedUnitPrice = item.unitPrice && item.unitPrice > 0
          ? item.unitPrice
          : Number(product.sellingPrice);

        if (resolvedUnitPrice <= 0) {
          errors.push(`  - ${product.name}: no sale price provided and product price is not set.`);
          continue;
        }

        if (item.unitPrice && item.unitPrice > 0 && Number(product.sellingPrice) !== item.unitPrice) {
          // Update price only if a new explicit price was provided
          product = await this.prisma.product.update({
            where: { id: product.id },
            data: { sellingPrice: item.unitPrice }
          });
        }

        const stock = await this.inventory.getStockLevel(organizationId, product.id);
        const available = stock.byBranch.find((row) => row.branchId === branch.id)?.quantity ?? 0;
        if (available < item.quantity) {
          errors.push(
            `  - ${product.name}: only ${available.toLocaleString("en-NG")} ${product.unit} available, cannot sell ${item.quantity.toLocaleString("en-NG")}.`
          );
          continue;
        }

        await this.inventory.recordTransaction(organizationId, {
          productId: product.id,
          branchId: branch.id,
          type: "SALE",
          quantity: item.quantity,
          note: `WhatsApp sale`
        });

        const lineTotal = item.quantity * resolvedUnitPrice;
        totalAmount += lineTotal;
        const remaining = available - item.quantity;
        const stockNotice = remaining <= product.lowStockLevel
          ? ` | Low stock: ${remaining.toLocaleString("en-NG")} left`
          : ` | Stock left: ${remaining.toLocaleString("en-NG")}`;
        recordedLines.push(
          `• ${item.quantity}x ${product.name} @ NGN ${resolvedUnitPrice.toLocaleString("en-NG")} = NGN ${lineTotal.toLocaleString("en-NG")}${stockNotice}`
        );
      } catch (err) {
        Logger.error(`[ActionExecutorService] Failed to record sale item "${item.name}":`, err);
        errors.push(`  ✗ ${item.name} (failed)`);
      }
    }

    if (recordedLines.length === 0) {
      return "⚠️ Could not record any items. Please try again.";
    }

    // Note: inventory.recordTransaction already writes a SALE Payment per item,
    // so we must NOT create an additional aggregate payment here or revenue
    // would be double-counted in analytics.

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

  private optionalNumber(
    params: Record<string, unknown>,
    keys: string[]
  ): number | undefined {
    for (const key of keys) {
      const val = params[key];
      if (typeof val === "number" && !isNaN(val)) return val;
      if (typeof val === "string") {
        const n = parseFloat(val.replace(/,/g, ""));
        if (!isNaN(n)) return n;
      }
    }
    return undefined;
  }

  // Unit nouns that may follow a quantity, e.g. "20 pieces", "3 cartons".
  private static readonly UNIT_NOUNS =
    "pieces?|pcs?|units?|pairs?|bags?|cartons?|packs?|dozens?|bottles?|boxes?|cans?|crates?|rolls?|sets?|sachets?|tins?|kg|g|litres?|liters?|l|ml";

  /**
   * Best-effort extraction of { name, price, initialQuantity } from a free-text
   * product description. Handles both terse commands ("add product Rice 5000
   * qty 10") and conversational phrasing ("we just got a new black tee. we got
   * 20 pieces for 20000 per quantity"). This is a fallback for when the LLM
   * doesn't return structured params — it must never confuse a quantity for a
   * price, so quantity is resolved first and removed before reading the price.
   */
  private parseProductText(source: string): {
    name?: string;
    price?: number;
    initialQuantity?: number;
  } {
    const text = source.trim();
    if (!text) return {};

    const normalized = text.replace(/,/g, "");
    const units = ActionExecutorService.UNIT_NOUNS;

    // --- quantity ---
    // 1) keyword form: "qty 10", "quantity: 10", "stock of 30"
    // 2) number + unit noun: "20 pieces", "3 cartons"
    const qtyKeyword = normalized.match(/\b(?:qty|quantity|stock|count)\s*(?:is|of|:|=)?\s*(\d+)\b/i);
    const qtyWithUnit = normalized.match(new RegExp(`\\b(\\d+)\\s*(?:${units})\\b`, "i"));
    const qtyMatch = qtyKeyword ?? qtyWithUnit;
    const initialQuantity = qtyMatch ? parseInt(qtyMatch[1], 10) : undefined;

    // Remove the quantity clause so it can't be misread as the price.
    const withoutQty = normalized
      .replace(/\b(?:qty|quantity|stock|count)\s*(?:is|of|:|=)?\s*\d+\b/gi, " ")
      .replace(new RegExp(`\\b\\d+\\s*(?:${units})\\b`, "gi"), " ");

    // --- price ---
    // 1) currency / "price" marker, or "for/at/@ <num>"
    // 2) otherwise the first remaining number
    const priceMarker =
      withoutQty.match(/(?:₦|#|ngn|price\s*(?:is|:)?)\s*(\d+(?:\.\d+)?)/i) ??
      withoutQty.match(/\b(?:for|at|@)\s*(?:₦|#|ngn)?\s*(\d+(?:\.\d+)?)/i);
    const priceFallback = withoutQty.match(/\b(\d+(?:\.\d+)?)\b/);
    const priceStr = (priceMarker ?? priceFallback)?.[1];
    const price = priceStr ? parseFloat(priceStr) : undefined;

    // --- name ---
    const name = normalized
      .replace(/\b(add|create|new|product|products|item|items)\b/gi, " ")
      .replace(/\b(?:we|i)\s+(?:just\s+)?(?:got|have|had|bought|received|added|get)\b/gi, " ")
      .replace(/\b(just|some|a|an|the|of)\b/gi, " ")
      .replace(new RegExp(`\\b\\d+\\s*(?:${units})\\b`, "gi"), " ")
      .replace(/\b(?:qty|quantity|stock|count)\s*(?:is|of|:|=)?\s*\d+\b/gi, " ")
      .replace(/\b(?:for|at|@)\s*(?:₦|#|ngn)?\s*\d+(?:\.\d+)?\b/gi, " ")
      .replace(/(?:₦|#|ngn|price)\s*\d+(?:\.\d+)?/gi, " ")
      .replace(/\bper\s+(?:quantity|unit|piece|item)\b/gi, " ")
      .replace(/\b(each|per)\b/gi, " ")
      .replace(/[.,!?]+/g, " ")
      .replace(/\b\d+(?:\.\d+)?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return { name: name || undefined, price, initialQuantity };
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
      const rawUnitPrice = obj.unitPrice ?? obj.unit_price ?? obj.price ?? obj.sellingPrice;
      const unitPrice = rawUnitPrice === undefined || rawUnitPrice === null || rawUnitPrice === ""
        ? undefined
        : Number(rawUnitPrice);
      if (name && quantity > 0) {
        items.push({
          name,
          quantity,
          unitPrice: unitPrice && !isNaN(unitPrice) ? unitPrice : undefined
        });
      }
    }
    return items;
  }

  // Fallback for when the LLM didn't isolate the product name: strip the
  // leading delete/remove command and product noun from the raw text.
  private stripDeleteCommand(text: string): string {
    return text
      .replace(/^\s*(?:please\s+)?(?:delete|remove|clear|drop)\s+/i, "")
      .replace(/\b(the|a|an)\b/gi, " ")
      .replace(/\b(products?|items?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractAvailabilityProduct(text: string): string {
    return text
      .replace(/^(?:do you (?:have|sell|stock)|is there|have you got)\s+/i, "")
      .replace(/[?.!]+$/, "")
      .trim();
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



