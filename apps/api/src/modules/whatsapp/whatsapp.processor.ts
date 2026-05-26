import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { ActionExecutorService } from "../ai/action-executor.service";
import { AiService, type ProposedAction, type ToolName } from "../ai/ai.service";
import { AiRepository } from "../ai/repositories/ai.repository";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";
import { WhatsAppService } from "./whatsapp.service";

// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppProcessor
//
// Message flow:
//
//   1. Receive raw inbound message.
//   2. Resolve organization + conversation.
//   3. Check for a PENDING (NEEDS_CONFIRMATION) action in this conversation.
//      a. User said YES  → execute the pending action.
//      b. User said NO   → reject and acknowledge.
//      c. User sent new intent → cancel pending, classify fresh.
//   4. Classify the message with AiService.proposeAction.
//   5. If requiresConfirmation=true → send confirmation prompt, do NOT execute.
//   6. If requiresConfirmation=false → execute immediately via ActionExecutorService.
// ─────────────────────────────────────────────────────────────────────────────

@Processor("whatsapp-inbound")
export class WhatsAppProcessor extends WorkerHost {
  constructor(
    private readonly whatsappRepo: WhatsAppRepository,
    private readonly ai: AiService,
    private readonly aiRepo: AiRepository,
    private readonly executor: ActionExecutorService,
    private readonly whatsapp: WhatsAppService,
    private readonly prisma: PrismaService
  ) {
    super();
  }

  async process(job: Job<{ providerEventId: string }>): Promise<void> {
    try {
      // ── 1. Load raw webhook event ──────────────────────────────────────────
      const event = await this.whatsappRepo.findWebhookEvent("whatsapp", job.data.providerEventId);
      if (!event) return;

      const payload = event.payload as Record<string, any>;
      const change = payload?.payload?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      const from: string | undefined = msg?.from;
      const rawText: string | undefined = msg?.text?.body;
      const displayName: string | undefined = change?.contacts?.[0]?.profile?.name;
      const phoneNumberId: string | undefined = change?.metadata?.phone_number_id;

      // ── 2. Validate required fields ────────────────────────────────────────
      if (!rawText || !from || !phoneNumberId) {
        console.log("[WhatsAppProcessor] Skipping — missing text, from, or phoneNumberId");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      // Strip surrounding backticks users sometimes send
      const text = rawText.replace(/^`+|`+$/g, "").trim();
      if (!text) {
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      console.log(`[WhatsAppProcessor] Inbound from ${from}: "${text}"`);

      // ── 3. Resolve organization ────────────────────────────────────────────
      const identity = await this.prisma.whatsAppIdentity.findUnique({ where: { phone: from } });
      const organization = identity
        ? await this.prisma.organization.findUnique({ where: { id: identity.organizationId } })
        : await this.whatsappRepo.findFirstOrganization();

      if (!organization) {
        console.warn("[WhatsAppProcessor] No organization found — skipping");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      // ── 4. Upsert account / contact / conversation ─────────────────────────
      const account = await this.whatsappRepo.upsertWhatsAppAccount(organization.id, phoneNumberId);
      const contact = await this.whatsappRepo.upsertContact(organization.id, account.id, from, displayName);
      const conversation = await this.whatsappRepo.findOrCreateConversation(organization.id, contact.id);

      // Persist inbound message for the conversation log
      await this.whatsappRepo.createMessage({
        organizationId: organization.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        providerMsgId: msg.id,
        text
      });

      // ── 5. Handle pending confirmation ─────────────────────────────────────
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
        await this.aiRepo.updateActionStatus(pending.id, "REJECTED", {
          reason: "User sent a new message — previous action cancelled"
        });
        console.log(`[WhatsAppProcessor] Cancelled pending ${pending.toolName} — user sent new intent`);
      }

      // ── 6. Classify intent ─────────────────────────────────────────────────
      console.log(`[WhatsAppProcessor] Classifying message…`);
      const { action } = await this.ai.proposeAction(organization.id, text, conversation.id);
      console.log(
        `[WhatsAppProcessor] intent=${action.intent} tool=${action.toolName} ` +
        `conf=${action.confidence} confirm=${action.requiresConfirmation}`
      );

      // ── 7. Dispatch based on confirmation requirement ──────────────────────
      if (action.requiresConfirmation) {
        // Send the AI's confirmation prompt and stop — do NOT execute yet
        await this.reply(organization.id, from, action.response);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        console.log(`[WhatsAppProcessor] Awaiting user confirmation for ${action.toolName}`);
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
      console.log(`[WhatsAppProcessor] Done — ${action.toolName}`);
    } catch (error) {
      console.error("[WhatsAppProcessor.process] Unexpected error:", error);
      // Do NOT re-throw — BullMQ will retry; log is enough for investigation
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pending action handler
  //
  // Returns true if the message was consumed by a pending action, false if the
  // caller should treat it as a fresh intent.
  // ─────────────────────────────────────────────────────────────────────────

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

    // ── Explicit YES ──────────────────────────────────────────────────────
    if (isYes) {
      console.log(`[WhatsAppProcessor] User confirmed ${pending.toolName}`);
      await this.aiRepo.updateActionStatus(pending.id, "APPROVED");

      const action = this.reconstructAction(pending);
      const result = await this.executor.execute(organizationId, action);

      await this.aiRepo.updateActionStatus(pending.id, "EXECUTED", { result });
      await this.reply(organizationId, from, result);
      return true;
    }

    // ── Explicit NO ───────────────────────────────────────────────────────
    if (isNo) {
      console.log(`[WhatsAppProcessor] User declined ${pending.toolName}`);
      await this.aiRepo.updateActionStatus(pending.id, "REJECTED", { reason: "User declined" });
      await this.reply(organizationId, from, "Cancelled. Let me know if there's anything else I can help with.");
      return true;
    }

    // ── Supplemental details for recordDebt ───────────────────────────────
    // e.g. pending was "Emeka owes me money" and AI asked "how much?" —
    // now user replies "30000"
    if (pending.toolName === "recordDebt") {
      const enriched = this.tryEnrichDebtParams(
        pending.input as Record<string, unknown>,
        text
      );
      if (enriched) {
        console.log(`[WhatsAppProcessor] Enriched debt parameters from user reply`);
        await this.aiRepo.updateActionStatus(pending.id, "APPROVED");
        const action = this.reconstructAction(pending, enriched);
        const result = await this.executor.execute(organizationId, action);
        await this.aiRepo.updateActionStatus(pending.id, "EXECUTED", { result });
        await this.reply(organizationId, from, result);
        return true;
      }
    }

    // ── Supplemental details for recordSale ──────────────────────────────
    // e.g. pending was "I want to record a sale" and user now provides items
    if (pending.toolName === "recordSale") {
      const enriched = this.tryEnrichSaleParams(
        pending.input as Record<string, unknown>,
        text
      );
      if (enriched) {
        console.log(`[WhatsAppProcessor] Enriched sale parameters from user reply`);
        await this.aiRepo.updateActionStatus(pending.id, "APPROVED");
        const action = this.reconstructAction(pending, enriched);
        const result = await this.executor.execute(organizationId, action);
        await this.aiRepo.updateActionStatus(pending.id, "EXECUTED", { result });
        await this.reply(organizationId, from, result);
        return true;
      }
    }

    // ── Supplemental details for createProduct ───────────────────────────
    if (pending.toolName === "createProduct") {
      const enriched = this.tryEnrichProductParams(
        pending.input as Record<string, unknown>,
        text
      );
      if (enriched) {
        console.log(`[WhatsAppProcessor] Enriched product parameters from user reply`);
        await this.aiRepo.updateActionStatus(pending.id, "APPROVED");
        const action = this.reconstructAction(pending, enriched);
        const result = await this.executor.execute(organizationId, action);
        await this.aiRepo.updateActionStatus(pending.id, "EXECUTED", { result });
        await this.reply(organizationId, from, result);
        return true;
      }
    }

    // ── Supplemental details for createCustomer ──────────────────────────
    if (pending.toolName === "createCustomer") {
      const enriched = this.tryEnrichCustomerParams(
        pending.input as Record<string, unknown>,
        text
      );
      if (enriched) {
        console.log(`[WhatsAppProcessor] Enriched customer parameters from user reply`);
        await this.aiRepo.updateActionStatus(pending.id, "APPROVED");
        const action = this.reconstructAction(pending, enriched);
        const result = await this.executor.execute(organizationId, action);
        await this.aiRepo.updateActionStatus(pending.id, "EXECUTED", { result });
        await this.reply(organizationId, from, result);
        return true;
      }
    }

    // Message didn't match any pending-action continuation — treat as new intent
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parameter enrichment helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * If the pending debt record is missing an amount and the user's reply
   * contains only a number, treat it as the missing amount.
   */
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

  /**
   * If pending sale has no items and the user's reply looks like sale lines,
   * use the text as sale source.
   */
  private tryEnrichSaleParams(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    // Must contain at least one sale-like pattern
    const isSaleLine = /\d+\s+.+\s+(for|@|at)\s*[\d,]+/i.test(text);
    if (!isSaleLine) return null;
    return { ...existing, sourceText: text, items: text };
  }

  /**
   * If pending createProduct has no name/price and user provides them.
   */
  private tryEnrichProductParams(
    existing: Record<string, unknown>,
    text: string
  ): Record<string, unknown> | null {
    const hasName = typeof existing.name === "string" && existing.name.length > 0;
    const hasPrice = Number(existing.sellingPrice ?? existing.price) > 0;
    if (hasName && hasPrice) return null;

    const priceMatch = text.replace(/,/g, "").match(/[₦#]?\s*(\d+(?:\.\d+)?)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;

    if (!hasName) {
      // Treat whole text as the name (minus any price part)
      const nameText = text.replace(/[₦#\d,.\s]+$/, "").trim() || text;
      return { ...existing, name: nameText, sellingPrice: price ?? existing.sellingPrice };
    }
    if (!hasPrice && price) {
      return { ...existing, sellingPrice: price };
    }
    return null;
  }

  /**
   * If pending createCustomer has no name, treat the reply as the name.
   */
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

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Rebuild a ProposedAction from a persisted AiAction record.
   * Merges optional parameter overrides (for enrichment cases).
   */
  private reconstructAction(
    record: { toolName: string; input: unknown },
    overrideParams?: Record<string, unknown>
  ): ProposedAction {
    const input = (record.input ?? {}) as Record<string, unknown>;
    return {
      intent: "UNKNOWN",               // Intent is only used for analytics; doesn't matter here
      confidence: 1,
      toolName: record.toolName as ToolName,
      parameters: overrideParams ? { ...input, ...overrideParams } : input,
      requiresConfirmation: false,     // Already confirmed
      response: ""
    };
  }

  private async reply(organizationId: string, to: string, text: string): Promise<void> {
    try {
      await this.whatsapp.sendText(organizationId, to, text);
    } catch (err) {
      console.error("[WhatsAppProcessor] Failed to send reply:", err);
    }
  }
}