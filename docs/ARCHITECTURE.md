# Vendra Architecture

Vendra is a WhatsApp-first SaaS operating system for African SMEs. The dashboard is
for setup, review, and exceptions; WhatsApp is the daily operating interface.

## Main Decisions

- Multi-tenant data model with `organizationId` on business-owned records.
- PostgreSQL stores the source of truth; Redis handles queues, retries, and rate
  limiting support.
- Inventory is transaction-led. Product stock changes through
  `InventoryTransaction`, with batches updated in the same database transaction.
- AI actions are proposals. The AI layer stores intent, confidence, requested tool,
  and validation data before domain services mutate business data.
- WhatsApp webhooks are stored first, then processed asynchronously through BullMQ.

## Backend

The NestJS API uses versioned routes under `/api/v1`, request validation, JWT auth,
tenant guards, centralized error responses, and Prisma repositories/services.

Critical modules:

- `auth`: signup, login, token refresh, initial organization and branch creation.
- `inventory`: products, stock levels, stock transactions, low-stock alerts.
- `whatsapp`: webhook verification, event deduplication, queue handoff.
- `ai`: intent proposal and action logging.
- `invoicing`, `debts`, `payments`, `analytics`: first operational surfaces.

## Frontend

The Next.js app is mobile-first, with quick actions and bottom navigation. It uses
TanStack Query for server cache/retries and Zustand for lightweight session state.
The offline queue stores failed/pending mutations in local storage for later sync.

## Scaling Path

Start with query-based analytics and a single API/worker deployment. As usage grows,
split workers by queue, add daily aggregate tables, move webhook secrets into a
managed secret store, and enforce Cloudflare WAF/rate-limiting policies at the edge.
