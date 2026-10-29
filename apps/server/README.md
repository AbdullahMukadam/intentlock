# @intentlock/server

The [Intentlock](../../README.md) service (NestJS + Prisma + Postgres): signs plan bundles with the team's Ed25519 key, stores agents, API keys and versioned policies, runs remote checks, manages holds and approvals, keeps the hash-chained audit log, and serves the inbox's REST and WebSocket API. Licensing (free-limits fallback, offline license verification) lives here.

```bash
docker compose up -d                                   # Postgres (+ Mailpit for the demo)
cp .env.example .env
pnpm --filter @intentlock/server prisma migrate dev
pnpm --filter @intentlock/server dev                   # http://localhost:3000, prints a one-time setup code
```

On an empty database the server prints `One-time setup code: …`; open the inbox (`/setup`), paste it and create the first admin. With `INTENTLOCK_DEMO=1`, setup also creates sample users and logs their passwords once.

- Configuration is all environment variables (`.env.example`, server section; every variable: [environment variables](../site/src/content/docs/docs/deployment/environment-variables.md)). `SIGNING_KEY` comes from `intentlock keygen`; unset in development, a key is generated and printed once.
- Every route needs a session unless marked public (sign-in, health, JWKS) or agent-only (API key). Health: `/health`, `/health/ready`.
- Stateless: any number of instances can share one database (`docs/DEPLOYMENT.md` §4–5). Migrations never run on boot; run `prisma migrate deploy` as a release step.
- Tests: `pnpm --filter @intentlock/server test` (uses `TEST_DATABASE_URL`, which the e2e suite wipes).

API and data model: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §5.

License: Elastic-2.0.
