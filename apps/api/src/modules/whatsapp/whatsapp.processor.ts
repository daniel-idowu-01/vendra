import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { ActionExecutorService } from "../ai/action-executor.service";
import { AiService, ProposedAction } from "../ai/ai.service";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";
import { WhatsAppService } from "./whatsapp.service";

@Processor("whatsapp-inbound")
export class WhatsAppProcessor extends WorkerHost {
  private pendingConfirmations = new Map<string, { action: ProposedAction; sessionId: string }>();

  constructor(
    private readonly whatsappRepo: WhatsAppRepository,
    private readonly ai: AiService,
    private readonly executor: ActionExecutorService,
    private readonly whatsapp: WhatsAppService
  ) {
    super();
  }

  async process(job: Job<{ providerEventId: string }>) {
    try {
      const event = await this.whatsappRepo.findWebhookEvent("whatsapp", job.data.providerEventId);
      if (!event) return;

      const organization = await this.whatsappRepo.findFirstOrganization();
      if (!organization) {
        console.warn("[WhatsAppProcessor] No organization found, skipping");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const payload = event.payload as Record<string, any>;
      const change = payload?.payload?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      const text = msg?.text?.body;
      const from = msg?.from;
      const displayName = change?.contacts?.[0]?.profile?.name;
      const phoneNumberId = change?.metadata?.phone_number_id;

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

      const pending = this.pendingConfirmations.get(conversation.id);
      const trimmed = text.trim().toLowerCase();
      const isYes = /^(yes|yeah|ok|okay|sure|confirm|proceed|do it|go ahead|correct|that's right)$/i.test(trimmed);
      const isNo = /^(no|nope|never|stop|cancel|don't|dont)$/i.test(trimmed);

      if (pending && isYes) {
        console.log(`[WhatsAppProcessor] User confirmed ${pending.action.toolName}, executing...`);
        const result = await this.executor.execute(organization.id, pending.action);
        const reply = pending.action.toolName === "unknown" ? pending.action.response : result;
        await this.whatsapp.sendText(organization.id, from, reply);
        this.pendingConfirmations.delete(conversation.id);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        console.log(`[WhatsAppProcessor] Done processing confirmed action`);
        return;
      }

      if (pending && isNo) {
        console.log(`[WhatsAppProcessor] User declined ${pending.action.toolName}`);
        await this.whatsapp.sendText(organization.id, from, "Cancelled. Let me know if you need anything else.");
        this.pendingConfirmations.delete(conversation.id);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      if (pending && this.isSaleDetails(trimmed)) {
        console.log(`[WhatsAppProcessor] User provided sale details, executing ${pending.action.toolName}...`);
        pending.action.parameters = { ...pending.action.parameters, items: text, sourceText: text };
        const result = await this.executor.execute(organization.id, pending.action);
        const reply = pending.action.toolName === "unknown" ? pending.action.response : result;
        await this.whatsapp.sendText(organization.id, from, reply);
        this.pendingConfirmations.delete(conversation.id);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        console.log(`[WhatsAppProcessor] Done processing confirmed action`);
        return;
      }

      if (pending && this.isDebtDetails(trimmed)) {
        console.log(`[WhatsAppProcessor] User provided debt details, executing ${pending.action.toolName}...`);
        pending.action.parameters = { ...pending.action.parameters, sourceText: text };
        const result = await this.executor.execute(organization.id, pending.action);
        const reply = pending.action.toolName === "unknown" ? pending.action.response : result;
        await this.whatsapp.sendText(organization.id, from, reply);
        this.pendingConfirmations.delete(conversation.id);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        console.log(`[WhatsAppProcessor] Done processing confirmed action`);
        return;
      }

      console.log(`[WhatsAppProcessor] Classifying with Gemini...`);
      const { action, sessionId } = await this.ai.proposeAction(organization.id, text, conversation.id);
      console.log(`[WhatsAppProcessor] ${action.intent} (${action.toolName}) conf=${action.confidence}`);

      if (action.requiresConfirmation) {
        console.log(`[WhatsAppProcessor] Requires confirmation, sending: "${action.response}"`);
        this.pendingConfirmations.set(conversation.id, {
          action: { ...action, requiresConfirmation: false },
          sessionId
        });
        await this.whatsapp.sendText(organization.id, from, action.response);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      this.pendingConfirmations.delete(conversation.id);

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

  private isSaleDetails(text: string): boolean {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    return lines.every((line) => {
      const hasNumber = /\d+/.test(line);
      const hasWord = /[a-zA-Z]{2,}/.test(line);
      return hasNumber && hasWord;
    });
  }

  private isDebtDetails(text: string): boolean {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    return lines.every((line) => {
      const hasName = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)?/.test(line);
      const hasAmount = /\d{2,}/.test(line);
      return hasName && hasAmount;
    });
  }
}
