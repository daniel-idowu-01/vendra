import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { ActionExecutorService } from "../ai/action-executor.service";
import { AiService } from "../ai/ai.service";
import { WhatsAppRepository } from "./repositories/whatsapp.repository";
import { WhatsAppService } from "./whatsapp.service";

@Processor("whatsapp-inbound")
export class WhatsAppProcessor extends WorkerHost {
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
        console.warn("[WhatsAppProcessor] Payload keys:", Object.keys(payload?.payload ?? {}));
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const account = await this.whatsappRepo.upsertWhatsAppAccount(organization.id, phoneNumberId);

      if (!text || !from) {
        console.log(`[WhatsAppProcessor] Skipping non-text message (from=${from}, text=${text})`);
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

      console.log(`[WhatsAppProcessor] Classifying with Gemini...`);
      const action = await this.ai.proposeAction(organization.id, text);
      console.log(`[WhatsAppProcessor] Gemini: ${action.intent} (${action.toolName}) conf=${action.confidence}`);

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
}
