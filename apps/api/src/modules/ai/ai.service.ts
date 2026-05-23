import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AiRepository } from "./repositories/ai.repository";

export type IntentType =
  | "INVENTORY_QUERY"
  | "INVENTORY_SALE"
  | "DEBT_LOOKUP"
  | "ANALYTICS_SUMMARY"
  | "INVOICE_GENERATION"
  | "CUSTOMER_LOOKUP"
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
  | "createInvoiceDraft"
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
- recordSale       → user wants to record a sale, stock-out (requiresConfirmation: true)
- createInvoiceDraft → user wants to create an invoice (requiresConfirmation: true)
- unknown          → user request doesn't match any tool

The user is a business owner. Respond conversationally in their language.
Only set requiresConfirmation=true for actions that modify data (recordSale, createInvoiceDraft).
For read-only queries set requiresConfirmation=false.

Respond with valid JSON only, no markdown. Example:
{
  "intent": "INVENTORY_QUERY",
  "confidence": 0.95,
  "toolName": "listProducts",
  "parameters": {},
  "requiresConfirmation": false,
  "response": "Sure, let me pull up your products."
}`;

@Injectable()
export class AiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

  constructor(
    private readonly aiRepo: AiRepository,
    private readonly config: ConfigService
  ) {
    const apiKey = this.config.get<string>("GEMINI_API_KEY") ?? "";
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    });
  }

  async proposeAction(organizationId: string, message: string, aiSessionId?: string): Promise<ProposedAction> {
    try {
      const result = await this.model.generateContent([
        { text: SYSTEM_PROMPT },
        { text: `User message: "${message}"` }
      ]);
      const text = result.response.text();
      const proposed = JSON.parse(text) as ProposedAction;

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

      return proposed;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("[AiService.proposeAction] Unexpected error:", error);
      return {
        intent: "UNKNOWN",
        confidence: 0,
        toolName: "unknown",
        parameters: {},
        requiresConfirmation: false,
        response: "Sorry, I couldn't process that request right now. Please try again."
      };
    }
  }
}
