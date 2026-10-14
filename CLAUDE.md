# CLAUDE.md — Intentlock

You are building **Intentlock**: a self-hosted, intent-based authorization layer for LLM agents, written in TypeScript, for small teams (one deployment per team, single-tenant). SDK packages are MIT; server, inbox, CLI, evals and demo are source-available under the Elastic License 2.0. An agent declares a plan, Intentlock signs it, every tool call is checked against the plan and policies (allow / block / hold), and every decision lands in a tamper-evident audit log.

> Name decided in ADR-001: npm scope `@intentlock/*`, CLI `intentlock`, env prefix `INTENTLOCK_`, API key prefix `il_live_`.

## Read these first, in order

1. `docs/PRD.md` — what we are building and why, scope, success metrics
2. `docs/ARCHITECTURE.md` — components, data model, API, token and policy formats
3. `docs/STRUCTURE.md` — folder and file layout, naming conventions, import rules. **Put new files where it says.**
4. `docs/PLAN.md` — phases, tasks, acceptance criteria. **This is the source of truth for what to do next.**
5. `docs/JOURNAL.md` — what has already been done, problems hit, what is next
6. `docs/DECISIONS.md` — decisions already made; do not re-litigate them silently
7. `docs/DEPLOYMENT.md` — deployment, multi-instance rules, scale test

## How to work

- **One phase at a time.** Find the first unchecked task in `docs/PLAN.md` and work on it. Do not start the next phase until the current phase's acceptance criteria pass.
- **Tick tasks as you finish them** in `docs/PLAN.md` (`- [ ]` → `- [x]`). Only tick after tests pass.
- **Append to `docs/JOURNAL.md` at the end of every work session** (and after any task that took real effort). Use the entry template at the top of that file. Newest entry at the bottom.
- **Record decisions.** Any non-obvious choice (library, format, trade-off, deviation from ARCHITECTURE.md) gets an ADR in `docs/DECISIONS.md`. If you change the architecture, update `docs/ARCHITECTURE.md` in the same commit.
- **Ask before** adding a new runtime dependency not listed in ARCHITECTURE.md, changing a public API shape, or skipping a planned test.
- **Small commits**, Conventional Commits style: `feat(core): add plan canonicalization`, `test(server): audit chain verify`, `docs: journal day 2`.

## Engineering rules

- **Fail closed.** A tool runs only on an explicit `allow`. Any error, timeout, missing decision, bad signature or expired token = block.
- **Never widen a signed plan.** Token refresh re-signs the *same* plan hash only.
- **Audit before acting.** In hybrid mode, a decision is appended (and fsynced) to the outbox before the tool runs or the block is returned. If the append fails, block. If the audit backlog is over its limit, block.
- **Default deny.** Every route requires a session unless explicitly marked `@Public()` (sign-in, health, JWKS) or `@AgentAuth()` (API-key routes). Nothing in the inbox is visible without signing in. Read endpoints are scoped by role (members see only their own runs). The route-enumeration test must stay green.
- **Agents own keys and policies.** An API key identifies an agent; the plan's `user` identifies the person. Plan signing snapshots the agent's active policy version. There are no policy files on the server.
- **Policy versions are immutable.** Publish creates version N+1 (409 if `baseVersion` is stale); rollback creates a new version copying an old one. Never update or delete a `PolicyVersion` row. Publishing and rollback are admin-only and audited.
- **People vs agents.** Agent apps authenticate with API keys; people with session cookies. Approve/reject accept sessions only, and the approver is always the signed-in user, never a value from the request body. The plan's `user` must be an active team member.
- **orgId everywhere.** Every table has `orgId` and every query is scoped through the shared Prisma helper, even though v0.1 has one organization.
- **Licensing never weakens security.** A missing, invalid or expired license only changes limits (falls back to Community); it never disables enforcement, holds or audit. License code lives in `apps/server`, never in the MIT packages.
- **License boundaries.** Never copy server/inbox code into the MIT packages (`core`, `sdk`, `guard`, `anthropic`). Each MIT package has its own `LICENSE` file; everything else is covered by the root ELv2 `LICENSE`.
- **Stateless server.** No in-memory state another instance needs. Counters use atomic SQL updates; state transitions use `WHERE status = 'PENDING'` guards; chain appends take an advisory lock; migrations never run on boot. See `docs/DEPLOYMENT.md` §5.
- **Pure core.** `packages/core` has no I/O: no network, no DB, no clock reads except through an injected `now()`. This keeps it testable and reusable by the server, the local gate and the evals.
- **Provider-agnostic guard.** The guard loop in `packages/guard` only talks to the `LLMProvider` interface. Provider-specific formats (Anthropic `tool_use` blocks, OpenAI `tool_calls`) live only inside adapters. Never import a provider SDK into `core`, `sdk` or the guard loop.
- **Every tool call gets a result.** Both Anthropic and OpenAI-style APIs require one result per tool call — blocked calls return an error result with the reason.
- **Tool names** must match `^[a-zA-Z0-9_-]{1,64}$` (no dots; valid for every provider). Use the tool registry for `(server, action)` mapping.
- **No paid key required to develop.** All tests use `FakeProvider`. Live runs use whatever `LLM_PROVIDER` is set in `.env` (default: an OpenAI-compatible free tier or local Ollama). The Anthropic adapter is tested with recorded/fake responses until a key is available.
- **Secrets:** never commit API keys, GitHub tokens or private keys. Use `.env` (gitignored) and `.env.example`. The demo uses throwaway GitHub accounts and fake data only.
- **Strict TypeScript** (`strict: true`, no `any` without a comment explaining why). Validate all external input with `zod`.
- **No comments.** Do not add code comments of any kind (no single-line notes, no `/** */` blocks, no spec links, no commented-out code). Put rationale in an ADR, the journal or the commit message instead.
- **Enums, not hardcoded strings — in every package.** Any fixed set of values (verdicts, block reasons, audit kinds, error codes, roles, origins, entry kinds, outcomes, logger contexts, throttler names, env values, provider error codes) is a TypeScript string `enum` with SCREAMING_SNAKE keys, e.g. `export enum AuditKind { USER_CREATED = "user_created" }`. Values that cross packages (verdicts, block reasons, report outcomes, client entry kinds) live once in `packages/core/src/enums/` and are imported from `@intentlock/core`, never redeclared. Elsewhere each enum lives in its own `<name>.enum.ts` inside the `enums/` folder of the feature that owns it (`users/enums/user-role.enum.ts`, `audit/enums/audit-kind.enum.ts`); shared server ones go in `common/enums/`. Exception: core's `Role` stays a zod enum (it is the boundary type shared with Prisma's `Role`); a server test keeps `UserRole`, Prisma `Role` and core `Role` identical. Use them in zod with `z.enum(MyEnum)`. HTTP status codes use Nest's `HttpStatus` enum, never numbers. When a Prisma enum exists for the same values (e.g. `Role`), keep a unit test that the TS enum and the Prisma enum match. Tests may assert raw wire values (`"user_exists"`, `401`) on purpose, since those pin the API contract.
- **API paths come from `API_ENDPOINTS`** (`@intentlock/core`). Never write a route string: server controllers use `@Controller()` with the full path in the method decorator (`@Post(API_ENDPOINTS.PLANS)`), clients build URLs with `apiPath(API_ENDPOINTS.HOLD_WAIT, { id })`. A new route is added to `API_ENDPOINTS` first.
- **Tests:** Vitest for unit and integration. Every policy rule type, every decision path and the audit chain verifier must have tests. Tests never sit in `src/`: unit tests in `test/unit/` mirroring the `src/` path, integration tests in `test/e2e/*.e2e.test.ts`, fixtures in `test/fixtures/` (ADR-052).
- **Import boundaries:** follow the dependency graph in `docs/STRUCTURE.md` §4. Import packages by name (`@intentlock/core`), never by deep path. Named exports only in packages.

## Commands

Scaffolded in Phase 0 with Better-T-Stack (monorepo, inbox, packages) and the Nest CLI (server); see `docs/STRUCTURE.md` §7 and ADR-029. Needs Node ≥ 22 and pnpm ≥ 10.26.

```bash
pnpm install
pnpm dev            # turbo: server + inbox + watch builds
pnpm build          # tsup for packages, nest build, next build
pnpm test           # vitest in every package (turbo builds dependencies first)
pnpm lint           # eslint incl. import-boundary rules (packages/config/eslint.js)
pnpm typecheck
pnpm format         # prettier (docs/ and CLAUDE.md are excluded)
docker compose up -d   # PostgreSQL 16 (intentlock + intentlock_test databases)
pnpm --filter @intentlock/server prisma migrate dev
pnpm --filter @intentlock/evals run eval
```

## Repo layout (full tree in `docs/STRUCTURE.md`)

```
apps/
  server/      NestJS policy + audit service (Postgres via Prisma)
  inbox/       Next.js approval inbox + audit viewer
  demo/        GitHub repo-assistant demo + split-screen runner
packages/
  core/        plan schema, canonicalization, signing, policy engine, audit hashing (pure)
  sdk/         Intentlock client: HybridGate (local decisions + outbox worker),
               HttpGate (remote), LocalGate (tests), PassThroughGate (demo)
  guard/       provider-agnostic agent guard: LLMProvider interface, guard loop,
               planner, OpenAI-compatible adapter, FakeProvider (uses sdk)
  anthropic/   Anthropic adapter implementing LLMProvider
  cli/         `intentlock` CLI: audit verify, keygen, policy validate
  ui/          shared shadcn/ui components (Better-T-Stack)
  config/      shared tsconfig presets + eslint config (import boundaries)
  evals/       prompt-injection scenario suite + metrics runner
  mcp-proxy/   MCP proxy that enforces Intentlock on any MCP server (stretch)
docs/          PRD, architecture, structure, plan, journal, decisions
```
