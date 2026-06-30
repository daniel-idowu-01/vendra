import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { InferenceClient } from "@huggingface/inference";
import { AiRepository } from "./repositories/ai.repository";

export type IntentType =
  | "INVENTORY_QUERY"
  | "INVENTORY_SALE"
  | "INVENTORY_DELETE"
  | "DEBT_LOOKUP"
  | "DEBT_CREATE"
  | "ANALYTICS_SUMMARY"
  | "INVOICE_GENERATION"
  | "CUSTOMER_LOOKUP"
  | "CUSTOMER_CREATE"
  | "UNKNOWN";

export type ToolName =
  | "getStockLevel"
  | "recordSale"
  | "listProducts"
  | "listTopDebtors"
  | "debtSummary"
  | "todaySales"
  | "lowStockAlert"
  | "listCustomers"
  | "createProduct"
  | "deleteProduct"
  | "deleteZeroStockProducts"
  | "createInvoiceDraft"
  | "createCustomer"
  | "recordDebt"
  | "settleDebt"
  | "unknown";

export type ProposedAction = {
  intent: IntentType;
  confidence: number;
  toolName: ToolName;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  response: string;
};

const SYSTEM_PROMPT = `You are Vendra AI, a business assistant embedded inside WhatsApp.
You help Nigerian business owners manage inventory, sales, customers, and debts in real-time.

────────────────────────────────────────────────
TOOL CATALOGUE  (use EXACTLY these toolName values)
────────────────────────────────────────────────
READ-ONLY  (requiresConfirmation: false)
  listProducts     → user wants to see their product list / inventory
  getStockLevel    → user asks about stock of a specific product
  lowStockAlert    → user asks about low-stock or nearly-finished items
  listTopDebtors   → user asks who owes them money, top debtors
  debtSummary      → user wants a full debt report
  todaySales       → daily sales overview, summary, dashboard
  listCustomers    → user wants to see their customers or client list

WRITE  (requiresConfirmation: true — user MUST confirm before execution)
  recordSale       → user says they sold something; extract items array
  createProduct    → user wants to add a new product
  createCustomer   → user wants to add a new customer
  recordDebt       → user says someone owes them money
  settleDebt       → user says a customer paid/settled debt
  deleteProduct    → user wants to delete/remove ONE specific product by name
  deleteZeroStockProducts → user wants to delete ALL products with 0 stock
  createInvoiceDraft → user wants to generate an invoice

FALLBACK
  unknown          → message doesn't match any tool above

────────────────────────────────────────────────
PARAMETER EXTRACTION RULES
────────────────────────────────────────────────
Users phrase things freely (conversational, terse, Pidgin, typos, with or without
₦/N, thousands like "20k" or "20,000"). Understand intent and extract what they
MEAN, not just exact keywords. Normalise money: "5k"→5000, "1.5m"→1500000,
"20,000"→20000. One message can contain multiple items.

For recordSale — extract an "items" array:
  Each item: { "name": string, "quantity": number, "unitPrice": number }
  - "quantity" is how many were sold; "unitPrice" is the price PER ONE.
  - If the user gives a total, divide by quantity for unitPrice when obvious;
    otherwise omit unitPrice and the system uses the product's saved price.
  Examples:
    "sold 3 bags for 5000 each" → [{"name":"bags","quantity":3,"unitPrice":5000}]
    "I sell 2 crates of coke and 5 bread" →
      [{"name":"coke","quantity":2},{"name":"bread","quantity":5}]
    "comot 10 sachet milk 200 each" → [{"name":"sachet milk","quantity":10,"unitPrice":200}]

For createProduct — extract:
  { "name": string, "sellingPrice": number, "unit": string, "initialQuantity": number }
  - "name" is the product only, with conversational filler removed.
  - "initialQuantity" is the stock count ("20 pieces", "we got 20" → 20).
  - "sellingPrice" is the money amount ("for 20000", "₦20000 each" → 20000).
  - NEVER swap quantity and price.
  Example: "we just got a new black tee, 20 pieces for 20000 each" →
    {"name":"black tee","initialQuantity":20,"sellingPrice":20000,"unit":"piece"}
  If price is missing, set sellingPrice to 0 and ask in response.

For createCustomer — extract:
  { "name": string, "phone": string | null }
  - Pull the person/business name; capture a phone number if present, else null.
  Examples:
    "add a customer called Mama Nkechi 08031234567" →
      {"name":"Mama Nkechi","phone":"08031234567"}
    "new client Emeka Stores" → {"name":"Emeka Stores","phone":null}

For recordDebt — extract:
  { "customerName": string, "amount": number }
  - "customerName" is who owes; "amount" is what they owe (normalise money).
  Examples:
    "Emeka owes me 15k" → {"customerName":"Emeka","amount":15000}
    "put 2,500 on Blessing's account" → {"customerName":"Blessing","amount":2500}
    "Tunde collect goods on credit" → {"customerName":"Tunde","amount":0} (ask for amount)
  If amount is missing, set amount to 0 and ask for it in response.

For settleDebt — extract:
  { "customerName": string, "amount": number | null, "settleAll": boolean }
  - "amount" is what they paid; set null for a full payment / "cleared everything".
  - settleAll=true ONLY when the user clearly means EVERYONE / ALL customers.
  Examples:
    "Emeka paid 5000" → {"customerName":"Emeka","amount":5000}
    "Blessing don clear her debt" → {"customerName":"Blessing","amount":null}
    "everyone has paid up" → {"settleAll":true,"amount":null}

For createInvoiceDraft — extract:
  { "customerName": string | null, "items": [{ "name": string, "quantity": number, "unitPrice": number }] }
  - "customerName" is who the invoice is for (null if none mentioned).
  - "items" are the things billed; same shape as recordSale.
  - If a unitPrice is not stated, omit it — the saved product price is used.
  Examples:
    "invoice Emeka for 3 bags of rice at 5000 each" →
      {"customerName":"Emeka","items":[{"name":"rice","quantity":3,"unitPrice":5000}]}
    "bill Mama Nkechi for 2 cartons of milk and 5 bread" →
      {"customerName":"Mama Nkechi","items":[{"name":"milk","quantity":2},{"name":"bread","quantity":5}]}

For deleteProduct — extract:
  { "productName": string }
  The name is the product to remove, WITHOUT the command word ("delete"/"remove").
  Examples: "delete black tee" → {"productName":"black tee"};
            "remove the rice product" → {"productName":"rice"}

For getStockLevel — extract:
  { "productName": string }
  Examples: "how many black tee remain" → {"productName":"black tee"};
            "do you still get rice?" → {"productName":"rice"}

────────────────────────────────────────────────
RESPONSE RULES
────────────────────────────────────────────────
- For WRITE tools: response must summarise what you understood and ask user to confirm.
  Example: "Record a debt of ₦15,000 for Emeka? Reply YES to confirm or NO to cancel."
- For READ tools: response is a brief acknowledgement, e.g. "Fetching your product list…"
- Respond in the SAME language the user used (English, Pidgin, Yoruba, Hausa, Igbo).
- Never make up data; only extract what the user explicitly stated.
- If confidence < 0.6, use toolName "unknown" and ask the user to clarify.
- NEVER classify a bare "yes" or "no" — those are handled outside this classifier.

────────────────────────────────────────────────
OUTPUT FORMAT  — valid JSON only, no markdown, no code fences
────────────────────────────────────────────────
{
  "intent": "<IntentType>",
  "confidence": <0.0–1.0>,
  "toolName": "<ToolName>",
  "parameters": { ... extracted fields ... },
  "requiresConfirmation": <true|false>,
  "response": "<message to send to user>"
}`;

const WRITE_TOOLS: ToolName[] = [
  "recordSale",
  "createProduct",
  "deleteProduct",
  "deleteZeroStockProducts",
  "createCustomer",
  "recordDebt",
  "settleDebt",
  "createInvoiceDraft",
];

const READ_TOOLS: ToolName[] = [
  "getStockLevel",
  "listProducts",
  "lowStockAlert",
  "listTopDebtors",
  "debtSummary",
  "todaySales",
  "listCustomers",
];

@Injectable()
export class AiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
  private readonly huggingFaceApiKey: string;
  private readonly huggingFaceModel: string;
  private readonly hfClient: InferenceClient;
  private static geminiBackoffUntilMs = 0;

  constructor(
    private readonly aiRepo: AiRepository,
    private readonly config: ConfigService
  ) {
    const geminiKey = this.config.get<string>("GEMINI_API_KEY") ?? "";
    this.huggingFaceApiKey =
      this.config.get<string>("HUGGINGFACE_API_KEY") ?? "";
    this.huggingFaceModel =
      this.config.get<string>("HUGGINGFACE_MODEL") ??
      "meta-llama/Llama-3.1-8B-Instruct:scaleway";
    this.hfClient = new InferenceClient(this.huggingFaceApiKey);
    this.genAI = new GoogleGenerativeAI(geminiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });
  }

  async proposeAction(
    organizationId: string,
    message: string,
    conversationId?: string
  ): Promise<{ action: ProposedAction; sessionId: string }> {
    const session = await this.aiRepo.findOrCreateSession(
      organizationId,
      conversationId
    );
    const sessionId = session.id;
    const history = await this.aiRepo.findRecentMessages(sessionId);

    // Bare yes/no should NEVER reach proposeAction.
    // The processor handles them before calling this method.
    // If somehow they slip through, return unknown so the processor
    // can handle it gracefully rather than creating a stale action.
    const isBareConfirmation =
      /^(yes|yeah|ok|okay|sure|confirm|proceed|do it|go ahead|correct|right|y|no|nope|cancel|stop|nah|n)$/i.test(
        message.trim()
      );
    if (isBareConfirmation) {
      const action: ProposedAction = {
        intent: "UNKNOWN",
        confidence: 1,
        toolName: "unknown",
        parameters: { sourceText: message },
        requiresConfirmation: false,
        response:
          "I am not sure what you are confirming. Please send your full request again.",
      };
      await this.aiRepo.createAiMessage({
        aiSessionId: sessionId,
        role: "user",
        content: message,
      });
      await this.aiRepo.createAiMessage({
        aiSessionId: sessionId,
        role: "assistant",
        content: action.response,
      });
      return { action, sessionId };
    }

    let proposed: ProposedAction;
    let provider = "unknown";

    // Stateful continuation: a bare quantity reply ("I want 5") to a previous
    // availability question. This depends on conversation state rather than how
    // the request is phrased, so we resolve it directly and skip the LLM.
    const followUp = this.classifyConversationalFollowUp(message, history);
    if (followUp) {
      proposed = followUp;
      provider = "follow-up";
    } else {
      try {
        // The LLM is the PRIMARY understanding + extraction engine so users can
        // phrase requests however they like (conversational, terse, multilingual,
        // typos, etc.). HuggingFace first, Gemini as backup.
        if (this.huggingFaceApiKey) {
          proposed = await this.classifyWithHuggingFace(message, history);
          provider = "huggingface";
        } else {
          proposed = await this.classifyWithGemini(message, history);
          provider = "gemini";
        }
      } catch (primaryErr) {
        Logger.warn(
          "[AiService] Primary classification failed:",
          (primaryErr as Error)?.message
        );
        try {
          if (this.huggingFaceApiKey) {
            proposed = await this.classifyWithGemini(message, history);
            provider = "gemini-fallback";
          } else {
            throw primaryErr;
          }
        } catch (secondaryErr) {
          Logger.warn(
            "[AiService] Secondary classification failed:",
            (secondaryErr as Error)?.message
          );
          // Offline / no-LLM safety net only: deterministic fast-paths, then
          // regex heuristics. These are intentionally last-resort — the LLM
          // handles the open-ended phrasing whenever it is reachable.
          proposed =
            this.classifyDeterministic(message, history) ??
            this.fallbackClassify(message);
          provider = "fallback";
        }
      }
    }

    proposed = this.validateAndRepair(proposed);

    await this.aiRepo.createAiMessage({
      aiSessionId: sessionId,
      role: "user",
      content: message,
    });
    await this.aiRepo.createAiMessage({
      aiSessionId: sessionId,
      role: "assistant",
      content: proposed.response,
    });

    await this.persistAction(organizationId, message, sessionId, proposed).catch(
      (err) =>
        Logger.error("[AiService] persistAction error (non-fatal):", err)
    );

    Logger.log(
      `[AiService] [${provider}] intent=${proposed.intent} tool=${proposed.toolName} conf=${proposed.confidence}`
    );
    return { action: proposed, sessionId };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Classification backends
  // ─────────────────────────────────────────────────────────────────────────

  private async classifyWithGemini(
    message: string,
    history: { role: string; content: string }[],
    retries = 3
  ): Promise<ProposedAction> {
    if (Date.now() < AiService.geminiBackoffUntilMs) {
      throw new Error("Gemini temporarily disabled due to rate-limit");
    }

    const contextBlock =
      history.length > 0
        ? history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")
        : "No prior conversation.";

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this.model.generateContent([
          { text: SYSTEM_PROMPT },
          { text: `--- CONVERSATION HISTORY ---\n${contextBlock}` },
          { text: `--- NEW USER MESSAGE ---\n${message}` },
        ]);
        return this.parseJsonResponse(result.response.text());
      } catch (err) {
        const isQuota =
          String(err).includes("429") ||
          String(err).includes("quota") ||
          String(err).includes("RESOURCE_EXHAUSTED");

        if (isQuota) {
          AiService.geminiBackoffUntilMs = Date.now() + 60_000;
        }

        if (isQuota && attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          Logger.warn(
            `[AiService] Gemini rate-limited (attempt ${attempt}/${retries}), retrying in ${delay}ms`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Gemini classification failed after all retries");
  }

  private async classifyWithHuggingFace(
    message: string,
    history: { role: string; content: string }[],
    retries = 2
  ): Promise<ProposedAction> {
    if (!this.huggingFaceApiKey || this.huggingFaceApiKey === "replace-me") {
      throw new Error("HuggingFace API key not configured");
    }

    const contextBlock =
      history.length > 0
        ? history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")
        : "No prior conversation.";

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const completion = await this.hfClient.chatCompletion({
          model: this.huggingFaceModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "system",
              content: `Conversation history:\n${contextBlock}`,
            },
            { role: "user", content: message },
          ],
          temperature: 0.2,
          max_tokens: 500,
        });

        const raw = completion.choices[0]?.message?.content ?? "";
        if (!raw)
          throw new Error(
            `Empty response from HuggingFace model "${this.huggingFaceModel}"`
          );
        return this.parseJsonResponse(raw);
      } catch (err) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error("HuggingFace classification failed after all retries");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Conversational continuation (runs ahead of the LLM)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolve a bare quantity reply ("I want 5", "give me 3 units") that follows a
   * previous availability question, turning it into a recordSale for the product
   * the user just asked about. This is conversation-state driven, not phrasing
   * driven, so it runs ahead of the LLM rather than as a fallback.
   */
  private classifyConversationalFollowUp(
    message: string,
    history: { role: string; content: string }[] = []
  ): ProposedAction | null {
    const m = message.toLowerCase().trim();
    const quantityFollowUp = m.match(/^(?:i\s*(?:want|need|will take|would like)|give me)\s+(\d+)\s*(?:units?|pieces?|pcs?)?$/i);
    if (!quantityFollowUp) return null;

    const previousUserMessage = [...history].reverse().find((entry) => entry.role === "user")?.content ?? "";
    const productName = this.extractProductFromAvailabilityQuestion(previousUserMessage);
    if (!productName) return null;

    const quantity = Number(quantityFollowUp[1]);
    return {
      intent: "INVENTORY_SALE",
      confidence: 0.98,
      toolName: "recordSale",
      parameters: { items: [{ name: productName, quantity }], sourceText: message },
      requiresConfirmation: true,
      response: `Sell ${quantity} ${quantity === 1 ? "unit" : "units"} of ${productName}? Reply YES to confirm or NO to cancel.`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deterministic fast-path — OFFLINE SAFETY NET ONLY.
  // Only used when every LLM provider is unreachable. When the LLM is up it
  // handles open-ended phrasing and parameter extraction; do not add patterns
  // here expecting them to run on the happy path.
  // ─────────────────────────────────────────────────────────────────────────
  private classifyDeterministic(
    message: string,
    _history: { role: string; content: string }[] = []
  ): ProposedAction | null {
    const m = message.toLowerCase().trim();

    const availabilityMatch = m.match(/^(?:do you (?:have|sell|stock)|is there|have you got)\s+(.+?)(?:\?|$)/i);
    if (availabilityMatch?.[1]) {
      return this.read("INVENTORY_QUERY", "getStockLevel", {
        productName: availabilityMatch[1].trim(), sourceText: message
      }, "Let me check that product.");
    }

    // "add product …" — always a createProduct regardless of LLM
    if (/\b(add|create|new)\b.*\b(products?|items?)\b/.test(m)) {
      return {
        intent: "INVENTORY_SALE",
        confidence: 0.95,
        toolName: "createProduct",
        parameters: { sourceText: message },
        requiresConfirmation: true,
        response:
          "Create this product? Reply YES to confirm or provide the name, price, and quantity if missing.",
      };
    }

    // "delete products with 0 stock"
    if (
      /\b(delete|remove|clear)\b.*\b(products?|items?)\b.*\b(0|zero|no)\s*(qty|quantity|stock|units?)\b/.test(m) ||
      /\b(delete|remove|clear)\b.*\b(0|zero|no)\s*(qty|quantity|stock|units?)\b.*\b(products?|items?)\b/.test(m)
    ) {
      return {
        intent: "INVENTORY_DELETE",
        confidence: 0.95,
        toolName: "deleteZeroStockProducts",
        parameters: { quantity: 0, sourceText: message },
        requiresConfirmation: true,
        response:
          "This will delete all products with 0 stock. Reply YES to confirm or NO to cancel.",
      };
    }

    // "delete/remove <product>" — a specific product (zero-stock handled above).
    // The executor resolves the actual product name and confirms not-found.
    if (/^\s*(?:please\s+)?(?:delete|remove|drop)\b/.test(m)) {
      return {
        intent: "INVENTORY_DELETE",
        confidence: 0.8,
        toolName: "deleteProduct",
        parameters: { sourceText: message },
        requiresConfirmation: true,
        response: "Delete this product? Reply YES to confirm or NO to cancel.",
      };
    }

    return null;
  }

  private extractProductFromAvailabilityQuestion(message: string): string {
    return message
      .replace(/^(?:how much (?:is|for)|what(?:'s| is) the price of|price of|do you (?:have|sell|stock)|is there|have you got)\s+/i, "")
      .replace(/[?.!]+$/, "")
      .trim();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Regex fallback (no LLM, no network)
  // ─────────────────────────────────────────────────────────────────────────

  private fallbackClassify(message: string): ProposedAction {
    const m = message.toLowerCase().trim();

    if (/\b(low.?stock|running out|almost finish|nearly finish)\b/.test(m)) {
      return this.read("INVENTORY_QUERY", "lowStockAlert", {}, "Checking for low stock items…");
    }
    if (/\b(stock|quantity|how many|remaining|units left)\b/.test(m)) {
      return this.read("INVENTORY_QUERY", "getStockLevel", { sourceText: message }, "Let me check that stock level.");
    }
    if (/\b(product|item|inventory|catalogue)\b/.test(m)) {
      return this.read("INVENTORY_QUERY", "listProducts", {}, "Pulling up your products…");
    }
    if (/\b(who owes|top debtor|list debt|show debt|debt report|outstanding)\b/.test(m)) {
      return this.read("DEBT_LOOKUP", "listTopDebtors", {}, "Fetching debtors…");
    }
    if (/\b(all debts?|full debt|debt summary)\b/.test(m)) {
      return this.read("DEBT_LOOKUP", "debtSummary", {}, "Fetching full debt report…");
    }
    if (/\b(today.?sale|daily sale|how much.?made|overview|dashboard)\b/.test(m)) {
      return this.read("ANALYTICS_SUMMARY", "todaySales", {}, "Fetching today's overview…");
    }
    if (/\b(customer|client|buyer)\b/.test(m) && !/\badd\b|\bcreate\b|\bnew\b/.test(m)) {
      return this.read("CUSTOMER_LOOKUP", "listCustomers", {}, "Fetching your customer list…");
    }

    // ---- write actions ----
    if (/\b(sold|sale|record sale|i sell)\b/.test(m)) {
      return this.write("INVENTORY_SALE", "recordSale", { sourceText: message },
        "I will record that sale. Please confirm — what was sold, quantity and price? Reply YES to confirm.");
    }
    if (/\b(owes? me|owe me|record debt|on credit)\b/.test(m)) {
      return this.write("DEBT_CREATE", "recordDebt", { sourceText: message },
        "I will record that debt. Please confirm — customer name and amount owed?");
    }
    if (/\b(settled?|paid|payment made|cleared?)\b.*\b(debt|owe|balance)\b/.test(m)) {
      return this.write("DEBT_CREATE", "settleDebt", { sourceText: message },
        "I will mark that debt as paid. Please confirm — customer name and amount paid (or say full payment). Reply YES to confirm.");
    }
    if (/\b(add|create|new)\b.*(customer|client)\b/.test(m)) {
      return this.write("CUSTOMER_CREATE", "createCustomer", { sourceText: message },
        "I will add that customer. Please confirm — name and phone number?");
    }
    if (/\b(invoice|receipt|bill)\b/.test(m)) {
      return this.write("INVOICE_GENERATION", "createInvoiceDraft", { sourceText: message },
        "I will draft that invoice. Please confirm the customer and items. Reply YES to confirm.");
    }

    return {
      intent: "UNKNOWN",
      confidence: 0.3,
      toolName: "unknown",
      parameters: { sourceText: message },
      requiresConfirmation: false,
      response:
        "I am not sure what you need. You can ask me about products, stock, sales, customers, or debts. What would you like?",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Validation & repair
  // ─────────────────────────────────────────────────────────────────────────

  private validateAndRepair(action: ProposedAction): ProposedAction {
    const ALL_TOOLS: ToolName[] = [
      "getStockLevel", "recordSale", "listProducts", "listTopDebtors",
      "debtSummary", "todaySales", "lowStockAlert", "listCustomers",
      "createProduct", "deleteProduct", "deleteZeroStockProducts", "createInvoiceDraft",
      "createCustomer", "recordDebt", "settleDebt", "unknown",
    ];

    if (!ALL_TOOLS.includes(action.toolName)) {
      Logger.warn(`[AiService] Unknown toolName "${action.toolName}" — resetting`);
      action.toolName = "unknown";
      action.intent = "UNKNOWN";
      action.requiresConfirmation = false;
    }

    // Write tools must always require confirmation
    if (WRITE_TOOLS.includes(action.toolName) && !action.requiresConfirmation) {
      Logger.warn(`[AiService] Write tool "${action.toolName}" missing confirmation flag — correcting`);
      action.requiresConfirmation = true;
      if (!action.response.toLowerCase().includes("yes")) {
        action.response += " Reply YES to confirm or NO to cancel.";
      }
    }

    // Read tools must never require confirmation
    if (READ_TOOLS.includes(action.toolName) && action.requiresConfirmation) {
      action.requiresConfirmation = false;
    }

    if (!action.parameters || typeof action.parameters !== "object") {
      action.parameters = {};
    }

    // Clamp confidence
    if (
      typeof action.confidence !== "number" ||
      action.confidence < 0 ||
      action.confidence > 1
    ) {
      action.confidence = 0.5;
    }

    // Ensure response is always a non-empty string
    if (!action.response || typeof action.response !== "string") {
      action.response = "Processing your request…";
    }

    // Coerce amount strings to numbers
    if (action.toolName === "recordDebt") {
      const raw = action.parameters.amount;
      if (typeof raw === "string") {
        const n = parseFloat(String(raw).replace(/,/g, ""));
        action.parameters.amount = isNaN(n) ? 0 : n;
      }
    }

    if (action.toolName === "settleDebt") {
      // Coerce settleAll
      if (typeof action.parameters.settleAll === "string") {
        action.parameters.settleAll = ["true", "yes", "1", "all"].includes(
          action.parameters.settleAll.toLowerCase()
        );
      }
      const raw = action.parameters.amount;
      if (typeof raw === "string") {
        const n = parseFloat(String(raw).replace(/,/g, ""));
        action.parameters.amount = isNaN(n) ? null : n;
      }
    }

    if (
      action.toolName === "recordSale" &&
      !Array.isArray(action.parameters.items)
    ) {
      action.parameters.items = [];
    }

    return action;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private parseJsonResponse(raw: string): ProposedAction {
    const clean = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*$/g, "")
      .trim();
    return JSON.parse(clean) as ProposedAction;
  }

  private read(
    intent: IntentType,
    toolName: ToolName,
    parameters: Record<string, unknown>,
    response: string
  ): ProposedAction {
    return { intent, confidence: 0.75, toolName, parameters, requiresConfirmation: false, response };
  }

  private write(
    intent: IntentType,
    toolName: ToolName,
    parameters: Record<string, unknown>,
    response: string
  ): ProposedAction {
    return { intent, confidence: 0.75, toolName, parameters, requiresConfirmation: true, response };
  }

  private async persistAction(
    organizationId: string,
    message: string,
    aiSessionId: string,
    proposed: ProposedAction
  ): Promise<void> {
    await this.aiRepo.createIntent({
      organizationId,
      name: proposed.intent,
      confidence: proposed.confidence,
      input: message,
    });

    await this.aiRepo.createAction({
      organizationId,
      aiSessionId,
      toolName: proposed.toolName,
      input: { ...proposed.parameters, sourceText: message },
      confidence: proposed.confidence,
      status: proposed.requiresConfirmation ? "NEEDS_CONFIRMATION" : "PROPOSED",
      validation: {
        rule: "AI actions are proposals only; domain services validate before mutation.",
      },
    });
  }
}
