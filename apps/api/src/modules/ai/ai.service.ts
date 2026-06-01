import { HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { InferenceClient } from "@huggingface/inference";
import { AiRepository } from "./repositories/ai.repository";

export type IntentType =
  | "INVENTORY_QUERY"
  | "INVENTORY_SALE"
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
  createInvoiceDraft → user wants to generate an invoice

FALLBACK
  unknown          → message doesn't match any tool above

────────────────────────────────────────────────
PARAMETER EXTRACTION RULES
────────────────────────────────────────────────
For recordSale — extract an "items" array:
  Each item: { "name": string, "quantity": number, "unitPrice": number }
  Example: "sold 3 bags for 5000 each" → items: [{"name":"bags","quantity":3,"unitPrice":5000}]

For createProduct — extract:
  { "name": string, "sellingPrice": number, "unit": string }
  If price is missing, set sellingPrice to 0 and ask in response.

For createCustomer — extract:
  { "name": string, "phone": string | null }

For recordDebt — extract:
  { "customerName": string, "amount": number }
  If amount is missing, set amount to 0 and ask in response.

For settleDebt — extract:
  { "customerName": string, "amount": number | null }
  If amount is missing, set amount to null (means settle full outstanding).

For getStockLevel — extract:
  { "productName": string }  (use productName, NOT productId)

────────────────────────────────────────────────
RESPONSE RULES
────────────────────────────────────────────────
- For WRITE tools: response must summarise what you understood and ask the user to confirm.
  Example: "Got it — record a debt of ₦15,000 for Emeka? Reply YES to confirm."
- For READ tools: response is a brief acknowledgement, e.g. "Fetching your product list…"
- Respond in the SAME language the user used (English, Pidgin, Yoruba, Hausa, Igbo).
- Never make up data; only extract what the user explicitly stated.
- If confidence < 0.6, use toolName "unknown" and ask the user to clarify.

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
    this.huggingFaceApiKey = this.config.get<string>("HUGGINGFACE_API_KEY") ?? "";
    this.huggingFaceModel =
      this.config.get<string>("HUGGINGFACE_MODEL") ?? "meta-llama/Llama-3.1-8B-Instruct:scaleway";
    this.hfClient = new InferenceClient(this.huggingFaceApiKey);
    this.genAI = new GoogleGenerativeAI(geminiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.1,           // Lower = more deterministic classification
        responseMimeType: "application/json"
      }
    });
  }

  async proposeAction(
    organizationId: string,
    message: string,
    conversationId?: string
  ): Promise<{ action: ProposedAction; sessionId: string }> {
    const session = await this.aiRepo.findOrCreateSession(organizationId, conversationId);
    const sessionId = session.id;
    const history = await this.aiRepo.findRecentMessages(sessionId);

    let proposed: ProposedAction;
    let provider = "unknown";

    try {
      if (this.huggingFaceApiKey) {
        proposed = await this.classifyWithHuggingFace(message, history);
        provider = "huggingface";
      } else {
        proposed = await this.classifyWithGemini(message, history);
        provider = "gemini";
      }
    } catch (primaryErr) {
      Logger.warn("[AiService] Primary AI classification failed:", (primaryErr as Error)?.message);
      try {
        if (this.huggingFaceApiKey) {
          proposed = await this.classifyWithGemini(message, history);
          provider = "gemini";
        } else {
          throw primaryErr;
        }
      } catch (secondaryErr) {
        Logger.warn("[AiService] Secondary AI classification failed:", (secondaryErr as Error)?.message);
        proposed = this.fallbackClassify(message, history);
        provider = "fallback";
      }
    }

    if (!proposed!) {
      proposed = this.fallbackClassify(message, history);
      provider = "fallback";
    }

    // Validate the parsed action — fix common LLM mistakes
    proposed = this.validateAndRepair(proposed);

    // Persist conversation turn
    await this.aiRepo.createAiMessage({ aiSessionId: sessionId, role: "user", content: message });
    await this.aiRepo.createAiMessage({ aiSessionId: sessionId, role: "assistant", content: proposed.response });

    // Persist intent + action for audit trail
    await this.persistAction(organizationId, message, sessionId, proposed).catch((err) =>
      Logger.error("[AiService] persistAction error (non-fatal):", err)
    );

    Logger.log(
      `[AiService] [${provider}] intent=${proposed.intent} tool=${proposed.toolName} conf=${proposed.confidence}`
    );
    return { action: proposed, sessionId };
  }

  private async classifyWithGemini(
    message: string,
    history: { role: string; content: string }[],
    retries = 3
  ): Promise<ProposedAction> {
    if (Date.now() < AiService.geminiBackoffUntilMs) {
      throw new Error("Gemini temporarily disabled due to recent quota/rate-limit error");
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
          { text: `--- NEW USER MESSAGE ---\n${message}` }
        ]);
        return this.parseJsonResponse(result.response.text());
      } catch (err) {
        const errStr = String(err);
        const isQuota =
          errStr.includes("429") ||
          errStr.includes("quota") ||
          errStr.includes("RESOURCE_EXHAUSTED");

        if (isQuota) {
          AiService.geminiBackoffUntilMs = Date.now() + 60_000;
        }

        if (isQuota && attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          Logger.warn(`[AiService] Gemini rate-limited (attempt ${attempt}/${retries}), retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Gemini classification failed after all retries");
  }

  private parseJsonResponse(raw: string): ProposedAction {
    const clean = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*$/g, "")
      .trim();
    const parsed = JSON.parse(clean) as ProposedAction;
    return parsed;
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
        const chatCompletion = await this.hfClient.chatCompletion({
          model: this.huggingFaceModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "system", content: `Conversation history:\n${contextBlock}` },
            { role: "user", content: message }
          ],
          temperature: 0.2,
          max_tokens: 500
        });

        const raw = chatCompletion.choices[0]?.message?.content ?? "";
        if (!raw) {
          throw new Error(`Empty response from HuggingFace model "${this.huggingFaceModel}"`);
        }
        return this.parseJsonResponse(raw);
      } catch (err) {
        if (attempt < retries) {
          const delay = 1000 * attempt;
          Logger.warn(`[AiService] Hugging Face failed (attempt ${attempt}/${retries}), retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Hugging Face classification failed after all retries");
  }

  
  private validateAndRepair(action: ProposedAction): ProposedAction {
    const VALID_TOOLS: ToolName[] = [
      "getStockLevel", "recordSale", "listProducts", "listTopDebtors",
      "debtSummary", "todaySales", "lowStockAlert", "listCustomers",
      "createProduct", "createInvoiceDraft", "createCustomer", "recordDebt", "settleDebt", "unknown"
    ];

    const WRITE_TOOLS: ToolName[] = [
      "recordSale", "createProduct", "createCustomer", "recordDebt", "settleDebt", "createInvoiceDraft"
    ];
    if (!VALID_TOOLS.includes(action.toolName)) {
      Logger.warn(`[AiService] LLM returned unknown toolName "${action.toolName}", resetting to unknown`);
      action.toolName = "unknown";
      action.intent = "UNKNOWN";
      action.requiresConfirmation = false;
    }

    // Write tool must always require confirmation
    if (WRITE_TOOLS.includes(action.toolName) && !action.requiresConfirmation) {
      Logger.warn(`[AiService] Write tool "${action.toolName}" had requiresConfirmation=false — correcting`);
      action.requiresConfirmation = true;
    }

    // Read tool must never require confirmation
    if (!WRITE_TOOLS.includes(action.toolName) && action.toolName !== "unknown" && action.requiresConfirmation) {
      action.requiresConfirmation = false;
    }

    // Ensure parameters is always an object
    if (!action.parameters || typeof action.parameters !== "object") {
      action.parameters = {};
    }

    // Clamp confidence
    if (typeof action.confidence !== "number" || action.confidence < 0 || action.confidence > 1) {
      action.confidence = 0.5;
    }

    // recordDebt: amount must be a number
    if (action.toolName === "recordDebt") {
      const raw = action.parameters.amount;
      if (typeof raw === "string") {
        const n = parseFloat(String(raw).replace(/,/g, ""));
        action.parameters.amount = isNaN(n) ? 0 : n;
      }
    }

    if (action.toolName === "settleDebt") {
      const raw = action.parameters.amount;
      if (typeof raw === "string") {
        const n = parseFloat(String(raw).replace(/,/g, ""));
        action.parameters.amount = isNaN(n) ? null : n;
      }
    }

    // recordSale: ensure items array exists
    if (action.toolName === "recordSale" && !Array.isArray(action.parameters.items)) {
      action.parameters.items = [];
    }

    return action;
  }

  
  private fallbackClassify(
    message: string,
    history: { role: string; content: string }[] = []
  ): ProposedAction {
    const m = message.toLowerCase().trim();
    const lastAssistant = [...history].reverse().find((h) => h.role === "assistant");
    const lastAiText = lastAssistant?.content.toLowerCase() ?? "";
    const prevUserMsg = [...history].reverse().find((h) => h.role === "user")?.content ?? "";

    const isYes = /^(yes|yeah|ok|okay|sure|confirm|proceed|do it|go ahead|correct|right)$/i.test(m);

    // If the AI was awaiting confirmation for a specific write tool, honour the YES
    if (isYes && lastAiText) {
      if (lastAiText.includes("record") && lastAiText.includes("debt")) {
        return this.makeWriteAction("DEBT_CREATE", "recordDebt",
          { sourceText: prevUserMsg },
          "✅ Recording the debt now…"
        );
      }
      if (lastAiText.includes("record") && lastAiText.includes("sale")) {
        return this.makeWriteAction("INVENTORY_SALE", "recordSale",
          { sourceText: prevUserMsg },
          "✅ Recording the sale now…"
        );
      }
      if (lastAiText.includes("create") && lastAiText.includes("product")) {
        return this.makeWriteAction("INVENTORY_SALE", "createProduct",
          { sourceText: prevUserMsg },
          "✅ Creating the product now…"
        );
      }
      if (lastAiText.includes("create") && lastAiText.includes("customer")) {
        return this.makeWriteAction("CUSTOMER_CREATE", "createCustomer",
          { sourceText: prevUserMsg },
          "✅ Adding the customer now…"
        );
      }
    }

    if (/\b(low.?stock|running out|almost finish|nearly finish)\b/.test(m)) {
      return this.makeReadAction("INVENTORY_QUERY", "lowStockAlert", {}, "Checking for low stock items…");
    }
    if (/\b(stock|quantity|how many|remaining|units left)\b/.test(m)) {
      return this.makeReadAction("INVENTORY_QUERY", "getStockLevel", { sourceText: message }, "Let me check the stock level.");
    }
    if (/\b(product|item|inventory|what (do )?i sell|catalogue)\b/.test(m)) {
      return this.makeReadAction("INVENTORY_QUERY", "listProducts", {}, "Pulling up your products…");
    }
    if (/\b(who owes|top debtor|list debt|show debt|debt report|outstanding)\b/.test(m)) {
      return this.makeReadAction("DEBT_LOOKUP", "listTopDebtors", {}, "Fetching debtors…");
    }
    if (/\b(settled?|paid|payment made|cleared?)\b.*\b(debt|owe|owing|balance)\b/.test(m)) {
      return {
        intent: "DEBT_CREATE", confidence: 0.8, toolName: "settleDebt",
        parameters: { sourceText: message }, requiresConfirmation: true,
        response: "I'll mark that debt as paid. Please confirm the customer name and amount paid (or say full payment)."
      };
    }
    if (/\b(all debts?|full debt|debt summary)\b/.test(m)) {
      return this.makeReadAction("DEBT_LOOKUP", "debtSummary", {}, "Fetching full debt report…");
    }
    if (/\b(today.?sale|daily sale|how much.?made|business summary|overview|dashboard)\b/.test(m)) {
      return this.makeReadAction("ANALYTICS_SUMMARY", "todaySales", {}, "Fetching today's overview…");
    }
    if (/\b(customer|client|buyer|who buy)\b/.test(m) && !/\badd\b|\bcreate\b|\bnew\b/.test(m)) {
      return this.makeReadAction("CUSTOMER_LOOKUP", "listCustomers", {}, "Fetching your customer list…");
    }

    if (/\b(sold|sale|record sale|i sell)\b/.test(m)) {
      return {
        intent: "INVENTORY_SALE", confidence: 0.65, toolName: "recordSale",
        parameters: { sourceText: message }, requiresConfirmation: true,
        response: "I'll record that sale. Please confirm — what was sold, quantity, and price?"
      };
    }
    if (/\b(owes? me|owe me|record debt|credit)\b/.test(m)) {
      return {
        intent: "DEBT_CREATE", confidence: 0.65, toolName: "recordDebt",
        parameters: { sourceText: message }, requiresConfirmation: true,
        response: "I'll record that debt. Please confirm — customer name and amount owed?"
      };
    }
    if (/\b(add|create|new)\b.*(product|item)\b/.test(m)) {
      return {
        intent: "INVENTORY_SALE", confidence: 0.6, toolName: "createProduct",
        parameters: { sourceText: message }, requiresConfirmation: true,
        response: "I'll create that product. Please confirm — name, price, and unit?"
      };
    }
    if (/\b(add|create|new)\b.*(customer|client)\b/.test(m)) {
      return {
        intent: "CUSTOMER_CREATE", confidence: 0.6, toolName: "createCustomer",
        parameters: { sourceText: message }, requiresConfirmation: true,
        response: "I'll add that customer. Please confirm — name and phone number?"
      };
    }
    if (/\b(invoice|receipt|bill)\b/.test(m)) {
      return {
        intent: "INVOICE_GENERATION", confidence: 0.6, toolName: "createInvoiceDraft",
        parameters: { sourceText: message }, requiresConfirmation: true,
        response: "I'll draft that invoice. Please confirm the customer and items."
      };
    }
    return {
      intent: "UNKNOWN", confidence: 0.3, toolName: "unknown",
      parameters: { sourceText: message }, requiresConfirmation: false,
      response:
        "I'm not sure what you need. You can ask me about products, stock, sales, customers, or debts. What would you like?"
    };
  }

  private makeReadAction(
    intent: IntentType,
    toolName: ToolName,
    parameters: Record<string, unknown>,
    response: string
  ): ProposedAction {
    return { intent, confidence: 0.7, toolName, parameters, requiresConfirmation: false, response };
  }

  private makeWriteAction(
    intent: IntentType,
    toolName: ToolName,
    parameters: Record<string, unknown>,
    response: string
  ): ProposedAction {
    return { intent, confidence: 0.75, toolName, parameters, requiresConfirmation: false, response };
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
      input: message
    });

    await this.aiRepo.createAction({
      organizationId,
      aiSessionId,
      toolName: proposed.toolName,
      input: { ...proposed.parameters, sourceText: message },
      confidence: proposed.confidence,
      status: proposed.requiresConfirmation ? "NEEDS_CONFIRMATION" : "PROPOSED",
      validation: {
        rule: "AI actions are proposals only; domain services validate before mutation."
      }
    });
  }
}



