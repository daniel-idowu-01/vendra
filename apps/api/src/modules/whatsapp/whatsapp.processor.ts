import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { AiActionStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ActionExecutorService } from "../ai/action-executor.service";
import { AiService, type ProposedAction, type ToolName } from "../ai/ai.service";
import { AiRepository } from "../ai/repositories/ai.repository";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";
import { WhatsAppService } from "./whatsapp.service";
import { InventoryService } from "../inventory/inventory.service";

// WhatsAppProcessor
@Processor("whatsapp-inbound")
export class WhatsAppProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsAppProcessor.name);

  constructor(
    private readonly whatsappRepo: WhatsAppRepository,
    private readonly ai: AiService,
    private readonly aiRepo: AiRepository,
    private readonly executor: ActionExecutorService,
    private readonly whatsapp: WhatsAppService,
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService
  ) {
    super();
  }

  async process(job: Job<{ providerEventId: string }>): Promise<void> {
    try {
      const event = await this.whatsappRepo.findWebhookEvent("whatsapp", job.data.providerEventId);
      if (!event) return;

      const payload = event.payload as {
        payload?: {
          entry?: Array<{
            changes?: Array<{
              value?: {
                messages?: Array<{
                  id?: string;
                  from?: string;
                  text?: { body?: string };
                  document?: { id?: string; filename?: string; mime_type?: string; caption?: string };
                }>;
                contacts?: Array<{ profile?: { name?: string } }>;
                metadata?: { phone_number_id?: string };
              };
            }>;
          }>;
        };
      };
      const change = payload?.payload?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      const from: string | undefined = msg?.from;
      const rawText: string | undefined = msg?.text?.body;
      const document = msg?.document;
      const displayName: string | undefined = change?.contacts?.[0]?.profile?.name;
      const phoneNumberId: string | undefined = change?.metadata?.phone_number_id;

      if ((!rawText && !document) || !from || !phoneNumberId) {
        this.logger.debug("Skipping inbound webhook: missing text/document, from, or phoneNumberId");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      // Strip surrounding backticks users sometimes send
      const text = (rawText ?? document?.caption ?? "").replace(/^`+|`+$/g, "").trim();
      if (!text) {
        this.logger.debug(`Inbound document from ${from}: "${document?.filename ?? document?.id}"`);
      } else {
        this.logger.debug(`Inbound from ${from}: "${text}"`);
      }

      const identity = await this.prisma.whatsAppIdentity.findUnique({ where: { phone: from } });
      const organization = identity
        ? await this.prisma.organization.findUnique({ where: { id: identity.organizationId } })
        : await this.whatsappRepo.findFirstOrganization();

      if (!organization) {
        this.logger.warn("No organization found for inbound WhatsApp message");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const account = await this.whatsappRepo.upsertWhatsAppAccount(organization.id, phoneNumberId);
      const contact = await this.whatsappRepo.upsertContact(organization.id, account.id, from, displayName);
      const conversation = await this.whatsappRepo.findOrCreateConversation(organization.id, contact.id);

      // Persist inbound message for the conversation log
      await this.whatsappRepo.createMessage({
        organizationId: organization.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        providerMsgId: msg?.id,
        text: text || document?.filename || "Document",
        mediaUrl: document?.id
      });

      if (document) {
        await this.handleDocumentImport(
          organization.id,
          from,
          document
        );
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const pending = await this.aiRepo.findLatestPendingActionForConversation(
        organization.id,
        conversation.id
      );

      if (pending) {
        const handled = await this.handlePendingAction(
          organization.id,
          from,
          text,
          pending
        );
        if (handled) {
          await this.whatsappRepo.markWebhookEventProcessed(event.id);
          return;
        }
        // Not handled = user sent a new intent; cancel pending and fall through
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.REJECTED, {
          reason: "User sent a new message — previous action cancelled"
        });
        this.logger.debug(`Cancelled pending ${pending.toolName}: user sent new intent`);
      }

      this.logger.debug("Classifying message");
      const { action } = await this.ai.proposeAction(organization.id, text, conversation.id);
      this.logger.debug(
        `[WhatsAppProcessor] intent=${action.intent} tool=${action.toolName} ` +
        `conf=${action.confidence} confirm=${action.requiresConfirmation}`
      );

      if (action.requiresConfirmation) {
        // Send the AI's confirmation prompt and stop — do NOT execute yet
        await this.reply(organization.id, from, action.response);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        this.logger.debug(`Awaiting user confirmation for ${action.toolName}`);
        return;
      }

      if (action.toolName === "unknown") {
        await this.reply(organization.id, from, action.response);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      // Execute read-only (or confirmed write) action
      const result = await this.executor.execute(organization.id, action);
      await this.reply(organization.id, from, result);
      await this.whatsappRepo.markWebhookEventProcessed(event.id);
      this.logger.debug(`Done - ${action.toolName}`);
    } catch (error) {
      this.logger.error("Unexpected processor error", error as Error);
    }
  }
  // Returns true if the message was consumed by a pending action, false if the
  // caller should treat it as a fresh intent.

  private async handleDocumentImport(
    organizationId: string,
    from: string,
    document: { id?: string; filename?: string; mime_type?: string; caption?: string }
  ) {
    const filename = document.filename ?? "spreadsheet";
    const isSpreadsheet =
      /\.(csv|xls|xlsx)$/i.test(filename) ||
      [
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ].includes(document.mime_type ?? "");

    if (!document.id || !isSpreadsheet) {
      await this.reply(
        organizationId,
        from,
        "Please send a CSV, XLS, or XLSX spreadsheet with columns for product name, price, and quantity."
      );
      return;
    }

    const buffer = await this.whatsapp.downloadMedia(document.id);
    if (!buffer) {
      await this.reply(organizationId, from, "I could not download that spreadsheet. Please try sending it again.");
      return;
    }

    const result = await this.inventory.importProductsFromSpreadsheet(organizationId, {
      buffer,
      originalname: filename,
      mimetype: document.mime_type
    });

    const warning = result.skipped > 0
      ? `\nSkipped: ${result.skipped}${result.errors.length ? `\n${result.errors.slice(0, 3).join("\n")}` : ""}`
      : "";

    await this.reply(
      organizationId,
      from,
      `Imported products from ${filename}.\nCreated: ${result.created}\nUpdated: ${result.updated}\nTotal saved: ${result.totalProcessed}${warning}`
    );
  }

  private async handlePendingAction(
    organizationId: string,
    from: string,
    text: string,
    pending: Awaited<ReturnType<AiRepository["findLatestPendingActionForConversation"]>>
  ): Promise<boolean> {
    if (!pending) return false;

    const trimmed = text.trim();
    const isYes = /^(yes|yeah|ok|okay|sure|confirm|proceed|do it|go ahead|correct|right)$/i.test(trimmed);
    const isNo = /^(no|nope|never|stop|cancel|don't|dont|nah)$/i.test(trimmed);

    if (isYes) {
      this.logger.debug(`User confirmed ${pending.toolName}`);
      await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.APPROVED);

      const action = this.reconstructAction(pending);
      const result = await this.executor.execute(organizationId, action);

      await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.EXECUTED, { result });
      await this.reply(organizationId, from, result);
      return true;
    }

    if (isNo) {
      this.logger.debug(`User declined ${pending.toolName}`);
      await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.REJECTED, { reason: "User declined" });
      await this.reply(organizationId, from, "Cancelled. Let me know if there's anything else I can help with.");
      return true;
    }

    // e.g. pending was "Emeka owes me money" and AI asked "how much?" —
    // now user replies "30000"
    if (pending.toolName === "recordDebt") {
      const enriched = this.tryEnrichDebtParams(
        pending.input as Record<string, unknown>,
        text
      );
      if (enriched) {
        this.logger.debug("Enriched debt parameters from user reply");
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.APPROVED);
        const action = this.reconstructAction(pending, enriched);
        const result = await this.executor.execute(organizationId, action);
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.EXECUTED, { result });
        await this.reply(organizationId, from, result);
        return true;
      }
    }

    // e.g. pending was "I want to record a sale" and user now provides items
    if (pending.toolName === "recordSale") {
      const enriched = this.tryEnrichSaleParams(
        pending.input as Record<string, unknown>,
        text
      );
      if (enriched) {
        this.logger.debug("Enriched sale parameters from user reply");
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.APPROVED);
        const action = this.reconstructAction(pending, enriched);
        const result = await this.executor.execute(organizationId, action);
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.EXECUTED, { result });
        await this.reply(organizationId, from, result);
        return true;
      }
    }

    if (pending.toolName === "createProduct") {
      const enriched = this.tryEnrichProductParams(
        pending.input as Record<string, unknown>,
        text
      );
      if (enriched) {
        this.logger.debug("Enriched product parameters from user reply");
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.APPROVED);
        const action = this.reconstructAction(pending, enriched);
        const result = await this.executor.execute(organizationId, action);
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.EXECUTED, { result });
        await this.reply(organizationId, from, result);
        return true;
      }
    }

    if (pending.toolName === "createCustomer") {
      const enriched = this.tryEnrichCustomerParams(
        pending.input as Record<string, unknown>,
        text
      );
      if (enriched) {
        this.logger.debug("Enriched customer parameters from user reply");
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.APPROVED);
        const action = this.reconstructAction(pending, enriched);
        const result = await this.executor.execute(organizationId, action);
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.EXECUTED, { result });
        await this.reply(organizationId, from, result);
        return true;
      }
    }

    // Message didn't match any pending-action continuation — treat as new intent
    return false;
  }

  
  private tryEnrichDebtParams(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    const existingAmount = Number(existing.amount);
    const hasAmount = existingAmount > 0;
    if (hasAmount) return null; // Already complete

    const numMatch = text.replace(/,/g, "").match(/^([\d]+(?:\.\d+)?)$/);
    if (numMatch) {
      return { ...existing, amount: parseFloat(numMatch[1]) };
    }
    // "30000 naira" or "₦30000"
    const embeddedNum = text.replace(/,/g, "").match(/[₦#]?\s*(\d+(?:\.\d+)?)/);
    if (embeddedNum) {
      return { ...existing, amount: parseFloat(embeddedNum[1]) };
    }
    return null;
  }

  
  private tryEnrichSaleParams(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    // Must contain at least one sale-like pattern
    const isSaleLine = /\d+\s+.+\s+(for|@|at)\s*[\d,]+/i.test(text);
    if (!isSaleLine) return null;
    return { ...existing, sourceText: text, items: text };
  }

  
  private tryEnrichProductParams(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    const hasName = typeof existing.name === "string" && existing.name.length > 0;
    const hasPrice = Number(existing.sellingPrice ?? existing.price) > 0;
    const hasQuantity = Number(existing.initialQuantity ?? existing.quantity ?? existing.qty) > 0;
    if (hasName && hasPrice && hasQuantity) return null;

    const normalized = text.replace(/,/g, "");
    const textWithoutQuantity = normalized.replace(/\b(?:qty|quantity|stock|count|units?)\s*(?:is|of|:)?\s*\d+\b/gi, "");
    const priceMatch = textWithoutQuantity.match(/[₦#]?\s*(\d+(?:\.\d+)?)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;
    const quantityMatch = normalized.match(/\b(?:qty|quantity|stock|count|units?)\s*(?:is|of|:)?\s*(\d+)\b/i);
    const initialQuantity = quantityMatch ? parseInt(quantityMatch[1], 10) : undefined;

    if (!hasName) {
      // Treat whole text as the name (minus any price part)
      const nameText = text
        .replace(/\b(?:qty|quantity|stock|count|units?)\s*(?:is|of|:)?\s*\d+\b/gi, "")
        .replace(/[₦#\d,.\s]+$/, "")
        .trim() || text;
      return {
        ...existing,
        sourceText: text,
        name: nameText,
        sellingPrice: price ?? existing.sellingPrice,
        initialQuantity: initialQuantity ?? existing.initialQuantity
      };
    }
    if ((!hasPrice && price) || (!hasQuantity && initialQuantity !== undefined)) {
      return {
        ...existing,
        sourceText: text,
        sellingPrice: price ?? existing.sellingPrice,
        initialQuantity: initialQuantity ?? existing.initialQuantity
      };
    }
    return null;
  }

  
  private tryEnrichCustomerParams(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    const hasName = typeof existing.name === "string" && existing.name.length > 0;
    if (hasName) return null;

    // If it looks like a plain name (letters/spaces only), use it
    if (/^[A-Za-z\s'-]{2,50}$/.test(text.trim())) {
      return { ...existing, name: text.trim() };
    }
    return null;
  }

  
  private reconstructAction(
    record: { toolName: string; input: unknown },
    overrideParams?: Record<string, unknown>
  ): ProposedAction {
    const input = (record.input ?? {}) as Record<string, unknown>;
    return {
      intent: "UNKNOWN", // Intent is only used for analytics; doesn't matter here
      confidence: 1,
      toolName: record.toolName as ToolName,
      parameters: overrideParams ? { ...input, ...overrideParams } : input,
      requiresConfirmation: false, // Already confirmed
      response: ""
    };
  }

  private async reply(organizationId: string, to: string, text: string): Promise<void> {
    try {
      await this.whatsapp.sendText(organizationId, to, text);
    } catch (err) {
      this.logger.error("Failed to send WhatsApp reply", err as Error);
    }
  }
}


