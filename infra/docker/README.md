# Docker Notes

Local development uses `docker-compose.yml` at the repository root for PostgreSQL,
Redis, API, and web containers.

Recommended local flow:

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

For container-only smoke testing:

```bash
docker compose up --build
```
