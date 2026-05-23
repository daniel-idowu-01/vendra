import { HttpException, Injectable } from "@nestjs/common";
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
  | "unknown";

export type ProposedAction = {
  intent: IntentType;
  confidence: number;
  toolName: ToolName;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  response: string;
};

const SYSTEM_PROMPT = `You are an AI assistant for Vendra, a business management system.
You help business owners manage their business in real-time via WhatsApp.

Use EXACTLY one of these toolName values. Do NOT invent new tool names.

Tool names and when to use them:
- listProducts     → user asks to see products, what they sell, inventory items
- getStockLevel    → user asks stock level of a specific product
- lowStockAlert    → user asks about low stock, products running out
- listTopDebtors   → user asks who owes money, top debtors, outstanding debts
- debtSummary      → user asks for full debt report
- todaySales       → user asks about today's sales, daily summary, business overview
- listCustomers    → user asks to see customers, client list
- recordSale       → user wants to record a sale (requiresConfirmation: true)
- createProduct    → user wants to add a new product (requiresConfirmation: true)
- createInvoiceDraft → user wants to create an invoice (requiresConfirmation: true)
- createCustomer   → user wants to add a new customer (requiresConfirmation: true)
- recordDebt       → user says someone owes them money, record a debt (requiresConfirmation: true)
- unknown          → user request doesn't match any tool

The user is a business owner. Respond conversationally in their language.
Only set requiresConfirmation=true for actions that modify data.
For read-only queries set requiresConfirmation=false.

The conversation history below shows previous messages. Use it for context.
For example, if you asked to confirm a customer name and the user replied with only a name,
use that to fulfill the previous intent.

Respond with valid JSON only, no markdown, no code fences. Example:
{"intent":"INVENTORY_QUERY","confidence":0.95,"toolName":"listProducts","parameters":{},"requiresConfirmation":false,"response":"Sure, let me pull up your products."}`;

@Injectable()
export class AiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
  private readonly hfClient: InferenceClient;
  private readonly hfModel: string;
  private readonly hfApiKey: string;

  constructor(
    private readonly aiRepo: AiRepository,
    private readonly config: ConfigService
  ) {
    const geminiKey = this.config.get<string>("GEMINI_API_KEY") ?? "";
    this.genAI = new GoogleGenerativeAI(geminiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    });
    this.hfApiKey = this.config.get<string>("HUGGINGFACE_API_KEY") ?? "";
    this.hfClient = new InferenceClient(this.hfApiKey);
    this.hfModel = "meta-llama/Llama-3.1-8B-Instruct:scaleway";
  }

  async proposeAction(
    organizationId: string,
    message: string,
    conversationId?: string
  ): Promise<{ action: ProposedAction; sessionId: string }> {
    let sessionId = "";
    let history: { role: string; content: string }[] = [];
    try {
      const session = await this.aiRepo.findOrCreateSession(organizationId, conversationId);
      sessionId = session.id;
      history = await this.aiRepo.findRecentMessages(sessionId);

      const contextBlock = history.length > 0
        ? history.map((m) => `${m.role}: ${m.content}`).join("\n")
        : "No previous conversation.";

      let proposed: ProposedAction | null = null;
      let usedProvider = "";

      try {
        proposed = await this.classifyWithGemini(message, contextBlock);
        usedProvider = "gemini";
      } catch (geminiErr) {
        console.warn("[AiService] Gemini failed:", (geminiErr as Error)?.message);
        try {
          proposed = await this.classifyWithHuggingFace(message, contextBlock);
          usedProvider = "huggingface";
        } catch (hfErr) {
          const hfCause = (hfErr as any)?.cause?.message ?? "";
          console.warn("[AiService] HuggingFace failed, using manual fallback:", (hfErr as Error)?.message, hfCause);
          proposed = this.fallbackClassify(message, history);
          usedProvider = "fallback";
        }
      }

      await this.aiRepo.createAiMessage({ aiSessionId: sessionId, role: "user", content: message });
      await this.aiRepo.createAiMessage({ aiSessionId: sessionId, role: "assistant", content: proposed.response });
      await this.persistAction(organizationId, message, sessionId, proposed);

      console.log(`[AiService] Classified via ${usedProvider}: ${proposed.intent} (${proposed.toolName})`);
      return { action: proposed, sessionId };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("[AiService.proposeAction] Unexpected error:", error);

      const proposed = this.fallbackClassify(message, history);
      if (sessionId) {
        await this.aiRepo.createAiMessage({ aiSessionId: sessionId, role: "user", content: message });
        await this.aiRepo.createAiMessage({ aiSessionId: sessionId, role: "assistant", content: proposed.response });
      }
      await this.persistAction(organizationId, message, sessionId, proposed);

      return { action: proposed, sessionId };
    }
  }

  private async classifyWithGemini(message: string, contextBlock: string): Promise<ProposedAction> {
    const result = await this.model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `Conversation history:\n${contextBlock}` },
      { text: `User message: "${message}"` }
    ]);
    return this.parseJsonResponse(result.response.text());
  }

  private async classifyWithHuggingFace(message: string, contextBlock: string): Promise<ProposedAction> {
    if (!this.hfApiKey || this.hfApiKey === "replace-me") {
      throw new Error("HuggingFace API key not configured");
    }

    try {
      const chatCompletion = await this.hfClient.chatCompletion({
        model: this.hfModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `Conversation history:\n${contextBlock}` },
          { role: "user", content: message }
        ],
        temperature: 0.2,
        max_tokens: 500
      });

      const raw = chatCompletion.choices[0]?.message?.content ?? "";
      if (!raw) throw new Error("Empty response from HuggingFace");

      return this.parseJsonResponse(raw);
    } catch (err) {
      console.error("[AiService] classifyWithHuggingFace error details:", err);
      if ((err as any)?.httpResponse) {
        console.error("[AiService] HuggingFace HTTP response:", JSON.stringify((err as any).httpResponse, null, 2));
      }
      throw err;
    }
  }

  private parseJsonResponse(raw: string): ProposedAction {
    const clean = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*$/g, "")
      .trim();
    return JSON.parse(clean) as ProposedAction;
  }

  private fallbackClassify(message: string, history: { role: string; content: string }[] = []): ProposedAction {
    const m = message.toLowerCase();

    const lastAssistant = [...history].reverse().find((h) => h.role === "assistant");
    const lastAi = lastAssistant?.content.toLowerCase() ?? "";
    const prevUser = [...history].reverse().find((h) => h.role === "user");
    const prevUserText = prevUser?.content ?? "";

    const isNumeric = /^\d+$/.test(m);
    const isYes = /^(yes|yeah|ok|okay|sure|confirm|proceed|do it|go ahead)$/.test(m);
    const isQuery = /^(who|show|list|check|what|how|tell|find|search|view)/.test(m);

    if (lastAi.includes("record") && lastAi.includes("debt") && lastAi.includes("amount") && !isQuery && (isNumeric || isYes)) {
      const amount = isNumeric ? m : "30,000";
      const customerMatch = prevUserText.match(/^(\w+)/);
      const customerName = customerMatch?.[1] ?? "the customer";
      return {
        intent: "DEBT_CREATE",
        confidence: 0.85,
        toolName: "recordDebt",
        parameters: { customerName, amount },
        requiresConfirmation: false,
        response: `✅ Done! I've recorded a debt of ₦${amount} for ${customerName}.`
      };
    }

    if (lastAi.includes("create") && lastAi.includes("product") && !isQuery && (isNumeric || isYes)) {
      return {
        intent: "INVENTORY_SALE",
        confidence: 0.8,
        toolName: "createProduct",
        parameters: { name: prevUserText, price: isNumeric ? m : "0" },
        requiresConfirmation: false,
        response: `✅ Product "${prevUserText}" has been created!`
      };
    }

    if (lastAi.includes("create") && lastAi.includes("customer") && !isQuery && (isNumeric || isYes)) {
      return {
        intent: "CUSTOMER_CREATE",
        confidence: 0.8,
        toolName: "createCustomer",
        parameters: { name: prevUserText },
        requiresConfirmation: false,
        response: `✅ Customer "${prevUserText}" has been added!`
      };
    }

    if (lastAi.includes("create") && lastAi.includes("product") && !isQuery) {
      return {
        intent: "INVENTORY_SALE",
        confidence: 0.7,
        toolName: "createProduct",
        parameters: { name: message, sourceText: message },
        requiresConfirmation: true,
        response: `Great, I'll create the product "${message}". Please confirm the price and quantity.`
      };
    }

    if (lastAi.includes("create") && lastAi.includes("customer") && !isQuery) {
      return {
        intent: "CUSTOMER_CREATE",
        confidence: 0.7,
        toolName: "createCustomer",
        parameters: { name: message, sourceText: message },
        requiresConfirmation: true,
        response: `Got it, I'll add "${message}" as a customer. Please confirm their phone number.`
      };
    }

    if (m.includes("create") && (m.includes("product") || m.includes("item"))) {
      return {
        intent: "INVENTORY_SALE",
        confidence: 0.6,
        toolName: "createProduct",
        parameters: { sourceText: message },
        requiresConfirmation: true,
        response: "I can create that product for you. Please confirm the name, price, and quantity before I proceed."
      };
    }

    if ((m.includes("owe") || m.includes("owes")) && (m.includes("who") || m.startsWith("who"))) {
      return {
        intent: "DEBT_LOOKUP",
        confidence: 0.75,
        toolName: "listTopDebtors",
        parameters: {},
        requiresConfirmation: false,
        response: "Let me check who owes you money."
      };
    }

    if (m.includes("add") && (m.includes("customer") || m.includes("client"))) {
      return {
        intent: "CUSTOMER_CREATE",
        confidence: 0.6,
        toolName: "createCustomer",
        parameters: { sourceText: message },
        requiresConfirmation: true,
        response: "I can add that customer. Please confirm their name and phone number before I proceed."
      };
    }

    if ((m.includes("owe") || m.includes("owes")) && (m.includes("me") || m.includes("my")) && (/\d/.test(m) || /^[A-Z][a-z]+/.test(m))) {
      const nameMatch = m.match(/^(\w+)/);
      const name = nameMatch?.[1] ?? "this person";
      return {
        intent: "DEBT_CREATE",
        confidence: 0.65,
        toolName: "recordDebt",
        parameters: { customerName: name, sourceText: message },
        requiresConfirmation: true,
        response: `I'll record a debt for ${name}. What is the amount?`
      };
    }

    if (m.includes("owe") || m.includes("debt") || m.includes("owes")) {
      return {
        intent: "DEBT_LOOKUP",
        confidence: 0.7,
        toolName: "listTopDebtors",
        parameters: {},
        requiresConfirmation: false,
        response: "Let me check who owes you money."
      };
    }

    if (m.includes("invoice") || m.includes("receipt") || m.includes("bill")) {
      return {
        intent: "INVOICE_GENERATION",
        confidence: 0.65,
        toolName: "createInvoiceDraft",
        parameters: { sourceText: message },
        requiresConfirmation: true,
        response: "I can draft that invoice. Please confirm the customer and items."
      };
    }

    if (m.includes("sold") || m.includes("sale") || m.includes("stock out")) {
      return {
        intent: "INVENTORY_SALE",
        confidence: 0.6,
        toolName: "recordSale",
        parameters: { sourceText: message },
        requiresConfirmation: true,
        response: "I can record that sale. Please confirm the details."
      };
    }

    if (m.includes("remain") || m.includes("stock") || m.includes("finish") || m.includes("quantity")) {
      return {
        intent: "INVENTORY_QUERY",
        confidence: 0.68,
        toolName: "getStockLevel",
        parameters: { sourceText: message },
        requiresConfirmation: false,
        response: "Let me check the stock levels for you."
      };
    }

    if (m.includes("product") || m.includes("item") || m.includes("inventory") || m.includes("what i sell")) {
      return {
        intent: "INVENTORY_QUERY",
        confidence: 0.65,
        toolName: "listProducts",
        parameters: {},
        requiresConfirmation: false,
        response: "Let me pull up your products."
      };
    }

    if (m.includes("customer") || m.includes("client") || m.includes("who buy")) {
      return {
        intent: "CUSTOMER_LOOKUP",
        confidence: 0.6,
        toolName: "listCustomers",
        parameters: {},
        requiresConfirmation: false,
        response: "Let me get your customer list."
      };
    }

    if (m.includes("sales") || m.includes("today") || m.includes("overview") || m.includes("summary")) {
      return {
        intent: "ANALYTICS_SUMMARY",
        confidence: 0.65,
        toolName: "todaySales",
        parameters: {},
        requiresConfirmation: false,
        response: "Let me fetch your business summary."
      };
    }

    return {
      intent: "UNKNOWN",
      confidence: 0.3,
      toolName: "unknown",
      parameters: { sourceText: message },
      requiresConfirmation: false,
      response: "I'm not sure how to help with that yet. Try asking about products, sales, customers, or debts."
    };
  }

  private async persistAction(organizationId: string, message: string, aiSessionId: string | undefined, proposed: ProposedAction) {
    try {
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
        input: proposed.parameters,
        confidence: proposed.confidence,
        status: proposed.requiresConfirmation ? "NEEDS_CONFIRMATION" : "PROPOSED",
        validation: {
          rule: "AI actions are proposals only; domain services validate before mutation."
        }
      });
    } catch (err) {
      console.error("[AiService.persistAction] Failed to persist:", err);
    }
  }
}
