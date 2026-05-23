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
        console.warn("[WhatsAppProcessor.process] No phone_number_id in payload");
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const account = await this.whatsappRepo.upsertWhatsAppAccount(organization.id, phoneNumberId);

      if (!text || !from) {
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const contact = await this.whatsappRepo.upsertContact(organization.id, account.id, from, displayName);

      const conversation = await this.whatsappRepo.findOrCreateConversation(organization.id, contact.id);

      await this.whatsappRepo.createMessage({
        organizationId: organization.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        providerMsgId: msg.id,
        text
      });

      const action = await this.ai.proposeAction(organization.id, text);

      if (action.requiresConfirmation) {
        await this.whatsapp.sendText(organization.id, from, action.response);
        await this.whatsappRepo.markWebhookEventProcessed(event.id);
        return;
      }

      const result = await this.executor.execute(organization.id, action);
      const reply = action.toolName === "unknown" ? action.response : result;

      await this.whatsapp.sendText(organization.id, from, reply);

      await this.whatsappRepo.markWebhookEventProcessed(event.id);
    } catch (error) {
      console.error("[WhatsAppProcessor.process] Unexpected error:", error);
    }
  }
}
