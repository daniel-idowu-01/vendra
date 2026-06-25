# Vendra

Vendra is a WhatsApp-first business operating system for African wholesalers and
distributors. It helps bulk trade teams manage stock, invoices, customer debts,
route-ready sales workflows, analytics, and AI-assisted business operations.

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

Vendra should stay simple and conversational for wholesale and distribution teams.
The web dashboard supports setup, review, and admin workflows; WhatsApp is the
daily operating surface for stock checks, sales rep updates, debt follow-up,
invoice sharing, customer account summaries, and AI summaries.
