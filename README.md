# Vendra

Vendra is a WhatsApp-first business operating system for African SMEs. It helps
distributors, pharmacies, supermarkets, wholesalers, beauty supply sellers, and
building material sellers manage stock, invoices, debts, analytics, and AI-assisted
business workflows.

## Apps

- `apps/api`: NestJS API with Prisma, JWT auth, tenant guards, BullMQ, WhatsApp and AI modules.
- `apps/web`: Next.js 15 mobile-first dashboard.
- `packages/database`: Prisma schema and database workflow.
- `packages/shared`: shared TypeScript constants and API types.

## Start Locally

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The web app runs on `http://localhost:3000` and the API on
`http://localhost:4000/api/v1`.

## Product Direction

Vendra should stay simple and conversational. The web dashboard supports setup,
review, and admin workflows; WhatsApp is the daily operating surface for stock
checks, sale updates, debt follow-up, invoice sharing, and AI summaries.
