import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  WEB_APP_URL: z.string().url(),
  META_WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  META_WHATSAPP_APP_SECRET: z.string().optional(),
  META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  HUGGINGFACE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().optional()
});

export function validateEnv(config: Record<string, unknown>) {
  return envSchema.parse(config);
}
