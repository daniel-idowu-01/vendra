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

type InboundPayload = {
  payload?: {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id?: string;
            from?: string;
            text?: { body?: string };
            document?: {
              id?: string;
              filename?: string;
              mime_type?: string;
              caption?: string;
            };
          }>;
          contacts?: Array<{ profile?: { name?: string } }>;
          metadata?: { phone_number_id?: string };
        };
      }>;
    }>;
  };
};

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
      const event = await this.whatsappRepo.findWebhookEvent(
        "whatsapp",
        job.data.providerEventId
      );
      if (!event) return;

      // Already processed — skip silently (idempotency guard)
      if (event.processedAt) {
        this.logger.debug(`Skipping already-processed event ${event.id}`);
        return;
      }

      const payload = event.payload as InboundPayload;
      const change = payload?.payload?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];

      const from: string | undefined = msg?.from;
      const rawText: string | undefined = msg?.text?.body;
      const document = msg?.document;
      const displayName: string | undefined =
        change?.contacts?.[0]?.profile?.name;
      const phoneNumberId: string | undefined =
        change?.metadata?.phone_number_id;

      if ((!rawText && !document) || !from || !phoneNumberId) {
        this.logger.debug(
          "Skipping: missing text/document, from, or phoneNumberId"
        );
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      // Strip surrounding backticks users sometimes add
      const text = (rawText ?? document?.caption ?? "")
        .replace(/^`+|`+$/g, "")
        .trim();

      this.logger.debug(`Inbound from ${from}: "${text}"`);

      // Resolve organisation from the sender's linked identity
      const identity = await this.prisma.whatsAppIdentity.findUnique({
        where: { phone: from },
      });
      const organization = identity
        ? await this.prisma.organization.findUnique({
            where: { id: identity.organizationId },
          })
        : await this.whatsappRepo.findFirstOrganization();

      if (!organization) {
        this.logger.warn("No organisation found for inbound message");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const account = await this.whatsappRepo.upsertWhatsAppAccount(
        organization.id,
        phoneNumberId
      );
      const contact = await this.whatsappRepo.upsertContact(
        organization.id,
        account.id,
        from,
        displayName
      );
      const conversation = await this.whatsappRepo.findOrCreateConversation(
        organization.id,
        contact.id
      );

      await this.whatsappRepo.createMessage({
        organizationId: organization.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        providerMsgId: msg?.id,
        text: text || document?.filename || "Document",
        mediaUrl: document?.id,
      });

      // ---------- spreadsheet import ----------
      if (document) {
        await this.handleDocumentImport(organization.id, from, document);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      // ---------- pending confirmation check ----------
      // This MUST happen before AI classification so a bare "yes"/"no" is
      // consumed by the pending action rather than going to the classifier.
      const pending =
        await this.aiRepo.findLatestPendingActionForConversation(
          organization.id,
          conversation.id
        );

      if (pending) {
        const consumed = await this.handlePendingAction(
          organization.id,
          from,
          text,
          pending
        );
        if (consumed) {
          await this.whatsappRepo.markWebhookEventProcessed(event.id);
          return;
        }
        // User sent a completely new message — cancel the stale pending action
        await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.REJECTED, {
          reason: "User sent a new message — previous action cancelled",
        });
        this.logger.debug(
          `Cancelled stale pending action ${pending.toolName}`
        );
      }

      // ---------- classify new intent ----------
      const { action } = await this.ai.proposeAction(
        organization.id,
        text,
        conversation.id
      );

      this.logger.debug(
        `intent=${action.intent} tool=${action.toolName} ` +
          `conf=${action.confidence} confirm=${action.requiresConfirmation}`
      );

      if (action.toolName === "unknown") {
        await this.reply(organization.id, from, action.response);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      if (action.requiresConfirmation) {
        // Send the confirmation prompt and stop — the action is already
        // persisted in NEEDS_CONFIRMATION state by AiService.proposeAction
        await this.reply(organization.id, from, action.response);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      // Read-only action — execute immediately
      const result = await this.executor.execute(organization.id, action);
      await this.reply(organization.id, from, result);
      await this.whatsappRepo.markWebhookEventProcessed(event.id);
    } catch (error) {
      this.logger.error("Unexpected processor error", error as Error);
      // Do NOT mark as processed — let BullMQ retry with backoff
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pending action handling
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns true if the message was consumed (i.e. it was a yes/no or a
   * parameter enrichment for the pending action).
   * Returns false if the caller should treat it as a fresh intent.
   */
  private async handlePendingAction(
    organizationId: string,
    from: string,
    text: string,
    pending: NonNullable<
      Awaited<
        ReturnType<AiRepository["findLatestPendingActionForConversation"]>
      >
    >
  ): Promise<boolean> {
    const trimmed = text.trim();
    const isYes =
      /^(yes|yeah|ok|okay|sure|confirm|proceed|do it|go ahead|correct|right|y)$/i.test(
        trimmed
      );
    const isNo =
      /^(no|nope|never|stop|cancel|don't|dont|nah|n)$/i.test(trimmed);

    if (isNo) {
      await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.REJECTED, {
        reason: "User declined",
      });
      await this.reply(
        organizationId,
        from,
        "Cancelled. Let me know if there is anything else I can help with."
      );
      return true;
    }

    if (isYes) {
      return this.executeConfirmedAction(organizationId, from, pending, null);
    }

    // Try to enrich missing parameters from the user's reply
    const input = (pending.input ?? {}) as Record<string, unknown>;
    const enriched = this.tryEnrichParameters(pending.toolName, input, text);
    if (enriched) {
      return this.executeConfirmedAction(organizationId, from, pending, enriched);
    }

    // Message doesn't match any continuation — treat as new intent
    return false;
  }

  private async executeConfirmedAction(
    organizationId: string,
    from: string,
    pending: { id: string; toolName: string; input: unknown },
    overrideParams: Record<string, unknown> | null
  ): Promise<boolean> {
    try {
      await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.APPROVED);
      const action = this.reconstructAction(pending, overrideParams ?? undefined);
      const result = await this.executor.execute(organizationId, action);
      await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.EXECUTED, {
        result,
      });
      await this.reply(organizationId, from, result);
      return true;
    } catch (err) {
      this.logger.error(
        `Failed executing confirmed action ${pending.toolName}`,
        err as Error
      );
      await this.aiRepo.updateActionStatus(pending.id, AiActionStatus.FAILED, {
        error: String(err),
      });
      await this.reply(
        organizationId,
        from,
        "Something went wrong while processing that. Please try again."
      );
      return true; // Still consumed — don't re-classify
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parameter enrichment
  // ─────────────────────────────────────────────────────────────────────────

  private tryEnrichParameters(
    toolName: string,
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    switch (toolName) {
      case "recordDebt":
        return this.enrichDebt(existing, text);
      case "recordSale":
        return this.enrichSale(existing, text);
      case "createProduct":
        return this.enrichProduct(existing, text);
      case "createCustomer":
        return this.enrichCustomer(existing, text);
      default:
        return null;
    }
  }

  private enrichDebt(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    const hasAmount = Number(existing.amount) > 0;
    if (hasAmount) return null; // Nothing to enrich

    const match = text.replace(/,/g, "").match(/[₦#]?\s*(\d+(?:\.\d+)?)/);
    if (!match) return null;

    const amount = parseFloat(match[1]);
    if (isNaN(amount) || amount <= 0) return null;

    return { ...existing, amount };
  }

  private enrichSale(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    // Accept if the reply contains a quantity-product-price pattern
    const isSaleLike = /\d+\s+\S.+?(for|@|at)\s*[\d,]+/i.test(text);
    if (!isSaleLike) return null;
    return { ...existing, sourceText: text, items: text };
  }

  private enrichProduct(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    const hasName =
      typeof existing.name === "string" && existing.name.trim().length > 0;
    const hasPrice = Number(existing.sellingPrice ?? existing.price) > 0;
    const hasQty =
      Number(
        existing.initialQuantity ?? existing.quantity ?? existing.qty
      ) >= 0;

    if (hasName && hasPrice && hasQty) return null; // Already complete

    const normalized = text.replace(/,/g, "");
    const qtyMatch = normalized.match(
      /\b(?:qty|quantity|stock|count|units?)\s*(?:is|of|:)?\s*(\d+)\b/i
    );
    const withoutQty = normalized.replace(
      /\b(?:qty|quantity|stock|count|units?)\s*(?:is|of|:)?\s*\d+\b/gi,
      ""
    );
    const priceMatch = withoutQty.match(/[₦#]?\s*(\d+(?:\.\d+)?)/);

    const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : undefined;

    if (!hasName) {
      const nameText = text
        .replace(/\b(?:qty|quantity|stock|count|units?)\s*(?:is|of|:)?\s*\d+\b/gi, "")
        .replace(/[₦#\d,.\s]+$/, "")
        .trim();
      return {
        ...existing,
        sourceText: text,
        name: nameText || text,
        sellingPrice: price ?? existing.sellingPrice,
        initialQuantity: qty ?? existing.initialQuantity,
      };
    }

    if ((!hasPrice && price !== undefined) || (!hasQty && qty !== undefined)) {
      return {
        ...existing,
        sourceText: text,
        sellingPrice: price ?? existing.sellingPrice,
        initialQuantity: qty ?? existing.initialQuantity,
      };
    }

    return null;
  }

  private enrichCustomer(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    const hasName =
      typeof existing.name === "string" && existing.name.trim().length > 0;
    if (hasName) return null;

    if (/^[A-Za-z\s''-]{2,60}$/.test(text.trim())) {
      return { ...existing, name: text.trim() };
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Document / spreadsheet import
  // ─────────────────────────────────────────────────────────────────────────

  private async handleDocumentImport(
    organizationId: string,
    from: string,
    document: {
      id?: string;
      filename?: string;
      mime_type?: string;
      caption?: string;
    }
  ): Promise<void> {
    const filename = document.filename ?? "spreadsheet";
    const isSpreadsheet =
      /\.(csv|xls|xlsx)$/i.test(filename) ||
      [
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ].includes(document.mime_type ?? "");

    if (!document.id || !isSpreadsheet) {
      await this.reply(
        organizationId,
        from,
        "Please send a CSV, XLS, or XLSX file with columns for product name, price, and quantity."
      );
      return;
    }

    const buffer = await this.whatsapp.downloadMedia(document.id);
    if (!buffer) {
      await this.reply(
        organizationId,
        from,
        "I could not download that file. Please try sending it again."
      );
      return;
    }

    try {
      const result = await this.inventory.importProductsFromSpreadsheet(
        organizationId,
        { buffer, originalname: filename, mimetype: document.mime_type }
      );

      const lines = [
        `Import complete for ${filename}.`,
        `Created: ${result.created}`,
        `Updated: ${result.updated}`,
        `Total saved: ${result.totalProcessed}`,
      ];
      if (result.skipped > 0) {
        lines.push(`Skipped: ${result.skipped}`);
        if (result.errors.length > 0) {
          lines.push(...result.errors.slice(0, 3));
        }
      }
      await this.reply(organizationId, from, lines.join("\n"));
    } catch (err) {
      this.logger.error("Spreadsheet import failed", err as Error);
      await this.reply(
        organizationId,
        from,
        "The import failed. Please check that the file has columns for name, price, and quantity."
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private reconstructAction(
    record: { toolName: string; input: unknown },
    overrideParams?: Record<string, unknown>
  ): ProposedAction {
    const base = (record.input ?? {}) as Record<string, unknown>;
    return {
      intent: "UNKNOWN",
      confidence: 1,
      toolName: record.toolName as ToolName,
      parameters: overrideParams ? { ...base, ...overrideParams } : base,
      requiresConfirmation: false,
      response: "",
    };
  }

  private async reply(
    organizationId: string,
    to: string,
    text: string
  ): Promise<void> {
    try {
      await this.whatsapp.sendText(organizationId, to, text);
    } catch (err) {
      this.logger.error("Failed to send WhatsApp reply", err as Error);
    }
  }
}