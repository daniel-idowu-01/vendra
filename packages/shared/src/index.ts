export const APP_NAME = "Vendra";

export const ROLES = ["OWNER", "ADMIN", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const AI_INTENTS = [
  "INVENTORY_QUERY",
  "INVENTORY_SALE_UPDATE",
  "INVOICE_GENERATION",
  "DEBT_LOOKUP",
  "ANALYTICS_SUMMARY",
  "REMINDER_REQUEST",
  "UNKNOWN"
] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

export type ApiEnvelope<T> = {
  data: T;
  requestId?: string;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
