# Intentlock

Self-hosted, intent-based authorization for LLM agents. An agent declares a plan, Intentlock signs it, every tool call is checked against the plan and policies (allow / block / hold), and every decision lands in a tamper-evident audit log.

Work in progress (v0.1). See [`docs/PRD.md`](docs/PRD.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). To add Intentlock to your own agent, see [`docs/USAGE.md`](docs/USAGE.md).

```bash
pnpm install
docker compose up -d   # PostgreSQL
pnpm test && pnpm lint && pnpm typecheck
```
