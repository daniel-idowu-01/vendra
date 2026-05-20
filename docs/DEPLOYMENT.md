# Deployment Guide

## Required Services

- Managed PostgreSQL
- Managed Redis
- Cloudinary
- Meta WhatsApp Cloud API
- Paystack
- Flutterwave
- Gemini API
- Hugging Face inference fallback
- Whisper-compatible transcription API

## Environment

Copy `.env.example` and provide production values. Use long random JWT secrets and
keep provider keys in a managed secret store.

## Database

Run Prisma migrations during deployment:

```bash
pnpm --filter @vendra/database migrate
```

Generate the Prisma client before building the API:

```bash
pnpm --filter @vendra/database generate
```

## Cloudflare

Place the web and API behind Cloudflare. Recommended edge controls:

- HTTPS only
- WAF rules for webhook endpoints
- Rate limits for auth and WhatsApp webhook routes
- Cache static Next.js assets

## Health Checks

Expose API health checks in the next implementation pass:

- API process alive
- PostgreSQL connectivity
- Redis connectivity
- Queue worker lag

## CI/CD

Minimum pipeline:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
