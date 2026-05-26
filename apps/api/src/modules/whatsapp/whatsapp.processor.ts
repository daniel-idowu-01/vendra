import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { ActionExecutorService } from "../ai/action-executor.service";
import { AiService, ProposedAction } from "../ai/ai.service";
import { AiRepository } from "../ai/repositories/ai.repository";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";
import { WhatsAppService } from "./whatsapp.service";

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

  async process(job: Job<{ providerEventId: string }>) {
    try {
      const event = await this.whatsappRepo.findWebhookEvent("whatsapp", job.data.providerEventId);
      if (!event) return;

      const payload = event.payload as Record<string, any>;
      const change = payload?.payload?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      let text = msg?.text?.body;
      if (text) text = text.replace(/^`|`$/g, "");
      const from = msg?.from;
      const displayName = change?.contacts?.[0]?.profile?.name;
      const phoneNumberId = change?.metadata?.phone_number_id;

      const identity = from
        ? await this.prisma.whatsAppIdentity.findUnique({ where: { phone: from } })
        : null;
      const organization = identity
        ? await this.prisma.organization.findUnique({ where: { id: identity.organizationId } })
        : await this.whatsappRepo.findFirstOrganization();

      if (!organization) {
        console.warn("[WhatsAppProcessor] No organization found, skipping");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      if (!phoneNumberId) {
        console.warn("[WhatsAppProcessor] No phone_number_id in webhook payload");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const account = await this.whatsappRepo.upsertWhatsAppAccount(organization.id, phoneNumberId);

      if (!text || !from) {
        console.log(`[WhatsAppProcessor] Skipping non-text message`);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      console.log(`[WhatsAppProcessor] Processing message from ${from}: "${text}"`);

      const contact = await this.whatsappRepo.upsertContact(organization.id, account.id, from, displayName);
      const conversation = await this.whatsappRepo.findOrCreateConversation(organization.id, contact.id);

      await this.whatsappRepo.createMessage({
        organizationId: organization.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        providerMsgId: msg.id,
        text
      });

      const pending = await this.aiRepo.findLatestPendingActionForConversation(organization.id, conversation.id);
      const trimmed = text.trim().toLowerCase();
      const isYes = /^(yes|yeah|ok|okay|sure|confirm|proceed|do it|go ahead|correct|that's right)$/i.test(trimmed);
      const isNo = /^(no|nope|never|stop|cancel|don't|dont)$/i.test(trimmed);

      if (pending && isYes) {
        const action = this.toProposedAction((pending.input as Record<string, unknown>) ?? {}, pending.toolName);
        console.log(`[WhatsAppProcessor] User confirmed ${action.toolName}, executing...`);
        await this.aiRepo.updateActionStatus(pending.id, "APPROVED", { confirmationReply: text });
        const result = await this.executor.execute(organization.id, action);
        const reply = action.toolName === "unknown" ? action.response : result;
        console.log(`[WhatsAppProcessor] Confirmed reply: "${reply?.slice(0, 80)}..."`);
        await this.aiRepo.updateActionStatus(pending.id, "EXECUTED", { reply });
        await this.whatsapp.sendText(organization.id, from, reply);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        console.log(`[WhatsAppProcessor] Done processing confirmed action`);
        return;
      }

      if (pending && isNo) {
        console.log(`[WhatsAppProcessor] User declined ${pending.toolName}`);
        await this.aiRepo.updateActionStatus(pending.id, "REJECTED", { rejectionReply: text });
        await this.whatsapp.sendText(organization.id, from, "Cancelled. Let me know if you need anything else.");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      if (pending && pending.toolName === "recordDebt" && this.isDebtDetails(text)) {
        const action = this.toProposedAction(
          { ...(pending.input as Record<string, unknown>), sourceText: text },
          pending.toolName
        );
        console.log(`[WhatsAppProcessor] User provided debt details, executing ${action.toolName}...`);
        await this.aiRepo.updateActionStatus(pending.id, "APPROVED", { detailsReply: text });
        const result = await this.executor.execute(organization.id, action);
        const reply = action.toolName === "unknown" ? action.response : result;
        console.log(`[WhatsAppProcessor] Debt details reply: "${reply?.slice(0, 80)}..."`);
        await this.aiRepo.updateActionStatus(pending.id, "EXECUTED", { reply });
        await this.whatsapp.sendText(organization.id, from, reply);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        console.log(`[WhatsAppProcessor] Done processing confirmed action`);
        return;
      }

      if (pending && pending.toolName === "recordSale" && this.isSaleDetails(text)) {
        const action = this.toProposedAction(
          { ...(pending.input as Record<string, unknown>), sourceText: text },
          pending.toolName
        );
        console.log(`[WhatsAppProcessor] User provided sale details, executing ${action.toolName}...`);
        await this.aiRepo.updateActionStatus(pending.id, "APPROVED", { detailsReply: text });
        const result = await this.executor.execute(organization.id, action);
        const reply = action.toolName === "unknown" ? action.response : result;
        console.log(`[WhatsAppProcessor] Sale details reply: "${reply?.slice(0, 80)}..."`);
        await this.aiRepo.updateActionStatus(pending.id, "EXECUTED", { reply });
        await this.whatsapp.sendText(organization.id, from, reply);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        console.log(`[WhatsAppProcessor] Done processing confirmed action`);
        return;
      }

      if (!pending && this.isSaleDetails(text)) {
        const action = this.toProposedAction({ items: text, sourceText: text }, "recordSale");
        console.log(`[WhatsAppProcessor] Direct sale execution: "${text}"`);
        const result = await this.executor.execute(organization.id, action);
        console.log(`[WhatsAppProcessor] Direct sale reply: "${result?.slice(0, 80)}..."`);
        await this.whatsapp.sendText(organization.id, from, result);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        console.log(`[WhatsAppProcessor] Done processing direct sale`);
        return;
      }

      console.log(`[WhatsAppProcessor] Classifying with Gemini...`);
      const { action } = await this.ai.proposeAction(organization.id, text, conversation.id);
      console.log(`[WhatsAppProcessor] ${action.intent} (${action.toolName}) conf=${action.confidence}`);

      if (action.requiresConfirmation) {
        console.log(`[WhatsAppProcessor] Requires confirmation, sending: "${action.response}"`);
        await this.whatsapp.sendText(organization.id, from, action.response);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      console.log(`[WhatsAppProcessor] Executing ${action.toolName}...`);
      const result = await this.executor.execute(organization.id, action);
      const reply = action.toolName === "unknown" ? action.response : result;

      console.log(`[WhatsAppProcessor] Sending reply: "${reply?.slice(0, 80)}..."`);
      await this.whatsapp.sendText(organization.id, from, reply);

      await this.whatsappRepo.markWebhookEventProcessed(event.id);
      console.log(`[WhatsAppProcessor] Done processing ${job.data.providerEventId}`);
    } catch (error) {
      console.error("[WhatsAppProcessor.process] Unexpected error:", error);
    }
  }

  private toProposedAction(parameters: Record<string, unknown>, toolName: string): ProposedAction {
    return {
      intent: "UNKNOWN",
      confidence: 1,
      toolName: (toolName as ProposedAction["toolName"]) ?? "unknown",
      parameters,
      requiresConfirmation: false,
      response: ""
    };
  }

  private isSaleDetails(text: string): boolean {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    return lines.every((line) => {
      return /^\d+\s+.+\s+(?:for|@)\s*\d+/i.test(line);
    });
  }

  private isDebtDetails(text: string): boolean {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    return lines.every((line) => {
      const hasName = /^[A-Za-z][a-z]+(\s+[A-Za-z][a-z]+)?/.test(line);
      const hasAmount = /\d{2,}/.test(line);
      return hasName && hasAmount;
    });
  }
}
