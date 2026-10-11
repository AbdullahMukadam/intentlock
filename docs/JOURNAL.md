# Journal — Intentlock

A running log of every work session. **Append a new entry at the bottom** at the end of each session (Claude Code does this automatically per `CLAUDE.md`). Keep entries short and factual; this is also the raw material for the README, the blog post and interview stories.

## Entry template

```markdown
### YYYY-MM-DD · Session N · Phase X — <short title>

**Done**
- <task from PLAN.md, ticked> (commit `abc1234`)

**Problems hit and how they were solved**
- <problem> → <fix / workaround>

**Decisions** (link ADRs)
- ADR-00X: <title>

**Numbers** (tests, coverage, latency, eval results — only real measurements)
- 

**Next**
- <first unchecked task in PLAN.md>

**Notes for Abdullah** (manual steps, questions, things to review)
- 
```

---

## Entries

### 2026-10-11 · Session 0 · Planning — docs written

**Done**
- Wrote `PRD.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `DEPLOYMENT.md`, `PLAN.md`, `DECISIONS.md`, this journal, and `CLAUDE.md`

**Decisions**
- ADR-001: name changed from IntentGate (already taken) to **Intentlock**
- ADR-001 to ADR-011 and ADR-013 to ADR-027 recorded (ADR-012, the default free model, is filled in during Phase 3)
- ADR-011: provider-agnostic guard, because the Anthropic billing card wasn't accepted
- ADR-013: hybrid enforcement (signed bundle, local allow/block, server only for holds + audit)
- ADR-014: local outbox file + background worker for batched audit uploads, with backpressure
- ADR-015: repo structure + import boundaries (`docs/STRUCTURE.md`)
- ADR-016: stateless server, multi-instance correctness in v0.1, fan-out + sharded chains as stretch (`docs/DEPLOYMENT.md`)
- ADR-017: free hosting on Render + Neon + Vercel (no credit card needed)
- ADR-018: scaffold with Better-T-Stack (monorepo, Next.js inbox, packages); NestJS server via Nest CLI
- ADR-019: target = small teams, self-hosted, single-tenant (orgId groundwork for a hosted version later)
- ADR-020: inbox sign-in with personal login tokens + sessions; approvals tied to the signed-in user
- ADR-021: Elastic License 2.0 for server/inbox/CLI, MIT for the SDK packages
- ADR-022: offline license keys + editions groundwork (Community fallback, never weakens enforcement)
- ADR-023: policies as DB versions, edited/tested/published in the inbox; optional CLI push from Git
- ADR-024: agents own API keys and policies (Community: 3 agents)
- ADR-025: dashboard (overview, activity, run detail) built on the audit log
- ADR-026: default-deny access; nothing public except sign-in
- ADR-027: three free demo agents (GitHub, support/Mailpit, files/sandbox) + our own private instance

**Next**
- Phase 0: claim the npm scope + repo name, scaffold with Better-T-Stack + Nest CLI (STRUCTURE §7)

**Notes for Abdullah**
- Create two throwaway GitHub accounts before Thursday (Phase 4)
- Docker installed locally (Postgres, Mailpit, self-host compose)
- No Anthropic key needed to start: all tests use `FakeProvider`
- Before Wednesday, get one free model option ready: a free Gemini or Groq API key, or Ollama installed locally with a tool-calling model
- If the Anthropic card issue gets fixed later, add the key to `.env` and run the `RUN_LIVE_ANTHROPIC=1` test
- Budget: evals make real model calls; keep N small at first and note token usage here
- Before Saturday: create free Render, Neon and Vercel accounts (no card needed)
- Before selling anything: have a lawyer confirm the ELv2/MIT split and set up a CLA for outside contributions

### 2026-10-11 · Session 1 · Planning — spec fixes before Phase 0

**Done**
- Fixed doc contradictions found on a full read-through (no code yet, repo not initialised, so no commit)

**Decisions** (link ADRs)
- ADR-028: audit hash covers every column; pure `check(bundle, …)` + `decide(token, …)`; `Decision` vs `GateDecision` (holdId); missing-arg semantics for negative operators; `orgId` on `StepUsage` and `PolicyDraft`
- ADR-019 and ADR-022 status lines now point at the ADRs that amended them (023, 024)

**Also fixed**
- zod 4 `z.record(z.string(), …)` in ARCHITECTURE §3; broken `packages/cli` tree in STRUCTURE §3; stale "policies from image" line in DEPLOYMENT §5.3; PLAN Phase 1 tasks updated to match

**Next**
- Phase 0: claim the npm scope + repo name (manual), then `create-better-t-stack --help` and `--dry-run`

**Notes for Abdullah**
- Review ADR-028 point 4: `notGlob`/`notIn` match when the arg is missing. Safe for block rules, but an `allow` rule using them would also allow calls without that arg

### 2026-10-11 · Session 2 · Phase 0 — scaffold

**Done**
- Better-T-Stack 3.44 monorepo (Turborepo, pnpm, Next.js 16) in the repo root; `apps/web` → `apps/inbox`; scope renamed to `@intentlock`
- `core`, `sdk`, `guard`, `anthropic`, `cli`, `evals` via `create-better-t-stack add --package`; each with tsup (ESM + d.ts), ESLint, README, smoke test; MIT `LICENSE` in the four SDK packages
- `apps/demo` (plain Node TS); `apps/server` from Nest CLI 12, converted to the shared tsconfig/ESLint; Prisma 7.10 initialised (`prisma.config.ts`, empty schema)
- Shared ESLint preset with the STRUCTURE §4 import boundaries; checked with throwaway files: `node:fs` and `@intentlock/sdk` in core, a deep `@intentlock/core/src/x` import in sdk, `openai` in guard outside `src/provider/`, and `@intentlock/sdk` in the server are all errors; `openai` inside `guard/src/provider/` passes
- `docker-compose.yml` (Postgres 16 + `intentlock_test`), `.env.example`, `.gitignore`, CI workflow, CLAUDE.md commands

**Problems hit and how they were solved**
- Generator needs pnpm ≥ 10.26 → upgraded global pnpm 10.12 → 10.34 (stayed on major 10)
- Generator ran a formatter over `docs/` and `CLAUDE.md` → restored from a backup; added `.prettierignore` so `pnpm format` leaves them alone
- Generator adds varlock (overrides `@next/env`) and `bunfig.toml` → removed (ADR-029)
- tsup dts build fails on TypeScript 6 (`baseUrl` deprecated) → `dts.compilerOptions.ignoreDeprecations: "6.0"`
- Package `eslint.config.js` tripped core's own `@intentlock/*` ban → boundary rules now apply to `src/` and `test/` only

**Decisions** (link ADRs)
- ADR-029: Phase 0 scaffold deviations (varlock removed, per-package Vitest, TS 6 pin, Prisma 7 config, inbox → core runtime dep)

**Numbers**
- 11 smoke tests green across 10 packages (server: 1 unit + 1 e2e); lint, typecheck, format check green locally
- Fresh `pnpm install` took 6 min 39 s on this connection (slow registry); cached reinstall 3.5 s

**Next**
- Finish Phase 0 acceptance: `docker compose up -d` (needs Docker) and a green CI run (needs the GitHub repo)
- Then Phase 1: core zod schemas

**Notes for Abdullah**
- **Docker is not installed** on this machine, so the docker-compose task and the "Postgres starts" acceptance check are unverified and left unticked. Install Docker Desktop, then run `docker compose up -d`
- **CI is unticked** until the repo is pushed to GitHub and the workflow runs green. Still to do: claim the npm scope and repo name (first Phase 0 task)
- **Approval needed before Phase 2:** Prisma 7's runtime client needs `@prisma/adapter-pg` + `pg`, which are not in ARCHITECTURE's allowed list (ADR-029). The other option is to pin Prisma 6, which needs no adapter
- `packages/ui` (generated shadcn components) has a typecheck but no smoke test or lint; it gets real tests when the inbox uses it in Phase 4

### 2026-10-11 · Session 3 · Phase 0 — Docker verified

**Done**
- Docker Desktop installed by Abdullah; `docker compose up -d --wait` brings up Postgres 16.15, healthy in ~8 s, with `intentlock` and `intentlock_test` databases
- Pinned the compose project name to `intentlock` (it defaulted to the folder name `intentgate`)
- Prisma CLI connects via the root `.env` (`prisma migrate status`: no migrations yet, as expected)

**Next**
- Last Phase 0 item: CI green on GitHub (needs the repo pushed)
- Phase 1: core zod schemas

**Notes for Abdullah**
- Docker's CLI isn't on PATH in shells opened before the install; open a new terminal or restart the editor

### 2026-10-12 · Session 4 · Phase 1 — core engine

**Done**
- `packages/core`: zod schemas (plan, tool call, policy, decision, bundle, audit entry), JCS + SHA-256, Ed25519 keys (PEM, kid, JWK), `signBundle`/`verifyBundle`, `matchStep` + every arg operator, policy matcher/evaluator, `canApprove`, YAML `parsePolicy` with line/col errors, `STARTER_POLICY`, `compareDecisions`, pure `check()`, `decide()`, `hashEntry`/`verifyChain`
- `packages/sdk`: `Gate` interface, `LocalGate` (in-memory per-plan usage, holds → `hold_requires_server`), `PassThroughGate`, `examples/local.ts`

**Problems hit and how they were solved**
- `yaml` only fills `linePos` with `prettyErrors`; computed positions from `pos` with a `LineCounter` instead
- A synchronous throw from `hashEntry` escaped `.rejects` → made it `async`
- Race: concurrent checks could both pass `maxCalls` across the `await` in token verification → `decide` reserves the slot in the same synchronous block as `check`; covered by a 5-way concurrent test
- `decide` with one usage array couldn't serve several plans safely (plan id unknown until verified) → takes `usageFor(planId)`
- A heredoc with a quoted regex broke the shell; wrote those test files with the editor instead

**Decisions** (link ADRs)
- ADR-030: Phase 1 core semantics (WebCrypto, no clock in `check`, atomic reservation in `decide`, operator details, block reason codes, names)

**Numbers**
- core: 141 tests, 100 % lines / 99.3 % branches (threshold 90 % lines enforced in `vitest.config.ts`)
- sdk: 8 tests
- `pnpm --filter @intentlock/sdk example` output:
  - `ALLOW in plan, in scope            github_list_issues(acme-demo/public-app)  [allow-in-plan]`
  - `BLOCK not in plan (injected)       github_create_pull_request(acme-demo/public-app)  [-: not_in_plan]`
  - `BLOCK in plan, blocked by policy   github_get_file_contents(acme-demo/private-notes)  [no-other-repos: ...]`

**Next**
- Phase 0 leftovers: npm scope + repo name, push, CI green
- Phase 2: NestJS scaffold, logging, zod pipe, exception filter

**Notes for Abdullah**
- Review ADR-030 point 3: a held call uses up one of its step's `maxCalls` even if the approver rejects it
- Phase 2 should cap regex complexity at plan signing (ReDoS), noted in ADR-030

### 2026-10-12 · Session 5 · Phase 2 — server scaffold and Prisma schema

**Done**
- NestJS scaffold: zod-validated env (`config/env.schema.ts`), pino logger behind a Nest `LoggerService`, `ZodValidationPipe`, global exception filter (bare 500, no stack or message); Nest hello-world removed
- Prisma schema from ARCHITECTURE §5.3 (+ indexes on `Plan`, `Hold`, `Session`, `ApiKey`), first migration `init`, client generated into `src/generated/prisma` on `postinstall`
- `orgDb(prisma, orgId)` org-scoped client extension; `createAgent()` (agent + policy set + starter policy v1), shared by the seed and the agents service to come
- `prisma/seed.ts` (`pnpm --filter @intentlock/server seed [--demo]`): org, admin/approver/member (+ intern), `github-assistant` agent with an API key; prints the secrets once and refuses to run on a non-empty database
- Test harness: global setup migrates `intentlock_test`, `resetDb()` truncates, e2e files run serially

**Problems hit and how they were solved**
- `prisma migrate dev` in Prisma 7 no longer runs `generate` → `postinstall: prisma generate`
- Generated client outside `src/` would not compile under `tsconfig.build.json`'s `rootDir: src` → moved the generator output into `src/generated/prisma`
- Docker Desktop wasn't running → started it; `docker compose up -d --wait` healthy

**Decisions** (link ADRs)
- ADR-031: org scoping via a Prisma extension, generated client location, logging, validation, test database

**Numbers**
- server: 10 tests (6 unit, 4 e2e against Postgres); lint, typecheck, build, format green
- `node dist/main.js` boots and answers an unknown route with a JSON 404; logs are pino JSON

**Next**
- Global default-deny session guard, `@Public()` / `@AgentAuth()`, route-enumeration test (then sign-in)

**Notes for Abdullah**
- The dev database (`intentlock`) is now seeded; to reseed, drop and recreate it (`pnpm --filter @intentlock/server prisma migrate reset`) and run the seed again

### 2026-10-12 · Session 6 · Phase 2 — sign-in and route protection

**Done**
- Global default-deny guard: sessions by default, `@Public()`, `@AgentAuth()` (API-key lookup, revoked keys rejected), `@Roles()`, CSRF header on every non-GET non-agent request
- `test/routes.e2e.test.ts`: enumerates every controller route via Nest discovery, pins the public list (`POST /v1/auth/login` for now) and the API-key list (empty for now), and calls every protected route without credentials expecting 401
- Auth: `POST /v1/auth/login` (constant-time compare, same 401 for every failure, throttled 5/min per email and 20/min per IP), `POST /v1/auth/logout`, `GET /v1/me`; 12 h sliding sessions; auth events audited
- `AuditService.append` (advisory lock, global chain, core `hashEntry`, optional caller transaction) and `toAuditEntry()` row mapping. The audit endpoints are still to do
- Bootstrap on an empty database (org + `BOOTSTRAP_ADMIN_EMAIL` admin, token logged once; `INTENTLOCK_DEMO=1` adds sample users), race-safe across instances
- Users endpoints (admin only): create (token shown once, 409 on duplicate), list, patch (role, groups, disabled; disabling ends sessions), re-issue token (ends sessions); admins can't demote or disable themselves; all audited. `maxUsers` waits for `LicenseService`

**Problems hit and how they were solved**
- Prisma transaction clients have no `$extends`, so `orgDb(tx)` is impossible → transactions are opened on the scoped client (`orgDb(...).$transaction`), and the audit chain head is read with raw SQL so it stays global
- Several logins per test file would hit the per-IP rate limit → tests create sessions directly in the database (`sessionCookie()`), and only the sign-in tests go through `/v1/auth/login`

**Decisions** (link ADRs)
- ADR-032: guard, CSRF, sessions, sign-in, rate limit, bootstrap, audit transactions

**Numbers**
- server: 29 tests (6 unit, 23 e2e); lint, typecheck, build, format green

**Next**
- Agents (create with starter policy, list with 24 h counts, update, disable), API keys, policy store

**Notes for Abdullah**
- The dev seed no longer takes `--demo`; it always adds approver, member and intern. Run it **before** the first server start: the server bootstraps an empty database itself, and the seed then refuses to run
- When we deploy behind nginx/Render, Express `trust proxy` must be set, or the per-IP sign-in limit sees one IP for everyone
