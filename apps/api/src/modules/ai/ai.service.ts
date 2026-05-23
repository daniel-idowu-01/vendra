import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { AiRepository } from "./repositories/ai.repository";

type ProposedAction = {
  intent: string;
  confidence: number;
  toolName: string;
  input: Record<string, unknown>;
  requiresConfirmation: boolean;
  response: string;
};

@Injectable()
export class AiService {
  constructor(private readonly aiRepo: AiRepository) {}

  async proposeAction(organizationId: string, message: string, aiSessionId?: string): Promise<ProposedAction> {
    try {
      const normalized = message.toLowerCase();
      const proposed = this.classify(normalized);

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
        input: proposed.input,
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
      throw new InternalServerErrorException("Failed to process AI action.");
    }
  }

  private classify(message: string): ProposedAction {
    if (message.includes("owe") || message.includes("debt")) {
      return {
        intent: "DEBT_LOOKUP",
        confidence: 0.82,
        toolName: "listTopDebtors",
        input: {},
        requiresConfirmation: false,
        response: "I can check your top debtors and overdue balances."
      };
    }
    if (message.includes("invoice")) {
      return {
        intent: "INVOICE_GENERATION",
        confidence: 0.74,
        toolName: "createInvoiceDraft",
        input: { sourceText: message },
        requiresConfirmation: true,
        response: "I can draft that invoice. Please confirm the customer and items before I create it."
      };
    }
    if (message.includes("sold") || message.includes("stock out")) {
      return {
        intent: "INVENTORY_SALE_UPDATE",
        confidence: 0.7,
        toolName: "recordSale",
        input: { sourceText: message },
        requiresConfirmation: true,
        response: "I heard a sale/stock update. Please confirm the product and quantity before I update stock."
      };
    }
    if (message.includes("remain") || message.includes("stock") || message.includes("finished")) {
      return {
        intent: "INVENTORY_QUERY",
        confidence: 0.78,
        toolName: "getStockLevel",
        input: { sourceText: message },
        requiresConfirmation: false,
        response: "I can check current stock levels for you."
      };
    }
    if (message.includes("sales") || message.includes("today")) {
      return {
        intent: "ANALYTICS_SUMMARY",
        confidence: 0.76,
        toolName: "getTodaySales",
        input: {},
        requiresConfirmation: false,
        response: "I can summarize today's sales and business alerts."
      };
    }
    return {
      intent: "UNKNOWN",
      confidence: 0.35,
      toolName: "askClarifyingQuestion",
      input: { sourceText: message },
      requiresConfirmation: false,
      response: "I am not fully sure yet. Try asking about stock, sales, invoices, or customer debts."
    };
  }
}
