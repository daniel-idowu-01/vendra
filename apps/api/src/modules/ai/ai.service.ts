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

Available capabilities:
- INVENTORY_QUERY: Check stock levels, find products, low stock alerts
- INVENTORY_SALE: Record a sale or stock-out
- DEBT_LOOKUP: Check who owes money, debt summaries
- ANALYTICS_SUMMARY: Today's sales, business overview
- INVOICE_GENERATION: Create invoices
- CUSTOMER_LOOKUP: Find customer info

The user is a business owner. Respond conversationally in their language.
Only set requiresConfirmation=true for actions that modify data (sales, invoices).
For read-only queries (stock check, debt lookup, analytics), set requiresConfirmation=false.

Respond with valid JSON only, no markdown:
{
  "intent": "...",
  "confidence": 0.0-1.0,
  "toolName": "...",
  "parameters": {},
  "requiresConfirmation": true/false,
  "response": "Friendly conversational reply"
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
