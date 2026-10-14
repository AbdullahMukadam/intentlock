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

### 2026-10-12 · Session 7 · Phase 2 — refactors, agents, API keys, policies, licensing

**Done**
- Validation moved to one global `ZodValidationPipe` with `zodDto(schema)` DTO classes; the route test fails on any `@Body/@Query/@Param` without a schema (ADR-031)
- Server restructured to the owner's NestJS reference layout: feature subfolders, one concern per file, four single-purpose global guards (ADR-033)
- String enums for every fixed value set, `HttpStatus` instead of numbers, single-line comments only; rules added to CLAUDE.md (ADR-034)
- Agents: create (starter policy v1, `maxAgents`), list/get with active key count, policy version and 24 h allow/block/hold counts, update, disable (`DELETE` is a soft disable); all audited
- API keys: `il_live_` + 32 bytes, shown once, SHA-256 + 12-char prefix stored, list, idempotent revoke, `lastUsedAt` (≤ 1 write/min); the API-key guard is tested through a probe `@AgentAuth()` controller
- Policy store: get active + draft, versions, one version, draft (saved even if invalid), validate (line/col errors), test (sample calls + audit replay, nothing saved), publish (N+1, 409 on stale base, race-safe), rollback (new version copying an old one); publishes and rollbacks audited
- `LicenseService`: offline JWS verify at boot and every 24 h, Community fallback for missing / invalid / expired, `hasFeature()`, `GET /v1/license`, `maxUsers` and `maxAgents` enforced (race-safe)

**Problems hit and how they were solved**
- Shell heredocs with backticks and apostrophes broke repeatedly → larger edits are written as Python scripts in the scratchpad
- Docker Desktop stopped mid-session, so tests failed with P1001 → restarted it; a reminder that `pnpm test` needs `docker compose up -d`
- VS Code showed `Argument "url" is missing in data source block "db"` → the Prisma extension was 6.7, which predates Prisma 7 moving the URL to `prisma.config.ts`; the CLI validates the schema fine

**Decisions** (link ADRs)
- ADR-033: server layout · ADR-034: enums and comments · ADR-035: agents, keys, policies, licensing

**Numbers**
- server: 61 tests (10 unit, 51 e2e); lint, typecheck, build, format green

**Next**
- Plans, check, holds and the audit chain (signing key + JWKS, `POST /v1/plans`, `/v1/check`, holds, reports, audit endpoints), then the "expired license changes no decision" test

**Notes for Abdullah**
- **Vendor private key:** `keys/vendor-private.pem` was generated on this machine and is git-ignored. Move it somewhere safe (password manager or offline storage). If it is lost, regenerate a pair and replace `vendor-public-key.constant.ts`; licenses signed with the old key then stop verifying
- Update the VS Code Prisma extension to 7.x to clear the false `url` warning

### 2026-10-12 · Session 8 · Phase 2 — plans, check, holds, audit chain

**Done**
- Signing key load/generate, `GET /v1/keys/jwks` (public)
- `POST /v1/plans` (agent from key, enabled agent, active user, policy + role + groups snapshot, ULID plan id, ReDoS heuristic) and `/refresh` (stored plan re-signed with the current policy; different hash → 409)
- `POST /v1/check`: verify → core `check()` → atomic counter → hold row → audit entry, one transaction
- Holds: hybrid create (server must agree), role-filtered list with `canApprove`, approve/reject (session only, separation of duties), long-poll wait (≤ 25 s, 1 s DB polling), expiry job (idempotent across instances), shutdown drain
- `POST /v1/report`: `ran` counts once per call, plan completion on required steps
- Audit: `GET /v1/audit` (member-scoped, filters, text search, cursor pages, JSONL export), `GET /v1/audit/verify`
- `/health`, `/health/ready`; LicenseService finished with the "expired license changes no decision" test

**Problems hit and how they were solved**
- A long-poll test never sent its request: supertest only dispatches when awaited → start it with `.then()` before approving
- Test assumed an admin may approve any hold; the spec says only if the hold's approver spec allows it → fixed the test, recorded in ADR-036

**Decisions** (link ADRs)
- ADR-036: plans, check, holds, reports, audit read paths

**Numbers**
- server: 92 tests (12 unit, 80 e2e); lint, typecheck, build, format green
- 10 concurrent checks on a `maxCalls: 3` step → exactly 3 allowed; 50 concurrent checks → contiguous seqs 1–51 and a valid chain
- Built server against the dev DB: `/health/ready` ok, JWKS served, unauthenticated `/v1/check` → 401

**Next**
- Role-scoped stats and runs, `POST /v1/audit/batch`, WebSocket `/events`, then `HttpGate` / `HybridGate` and the outbox

**Notes for Abdullah**
- In production `SIGNING_KEY` is now mandatory (the server refuses to boot without it); `intentlock keygen` arrives with the CLI task, until then a dev boot logs a generated key you can copy

### 2026-10-12 · Session 9 · Phase 2 — runs, stats, live events

**Done**
- `GET /v1/runs` (role-scoped, counts, cursor, status filter) and `GET /v1/runs/:planId` (ordered decisions, holds, reports, timing)
- `GET /v1/stats/overview`: verdicts over time, totals, top blocked tools and rules, pending holds, median time-to-approve, flagged count, audit lag
- WebSocket `/events` with handshake auth, origin check, per-role filtering, 60 s session recheck; `decision`, `hold.created`, `hold.resolved` emitted after commit
- `SessionsService` extracted so HTTP and WebSocket share one session check; verdict tallying shared by agents and runs

**Problems hit and how they were solved**
- `SIGNING_KEY` in `.env` held only the PEM's first line (unquoted multi-line value), and `keys/signing-key.pem` was UTF-16 (PowerShell `>` redirect) → converted the file to UTF-8 and rewrote the entry as a double-quoted value; the server now loads it (kid `9a4FWXxG`)
- Docker Desktop was down again after the overnight restart → restarted
- Socket auth in `handleConnection` left a moment where an unauthenticated socket was connected → moved to Socket.IO handshake middleware

**Decisions** (link ADRs)
- ADR-037: runs, stats, live events

**Numbers**
- server: 102 tests (14 unit, 88 e2e); lint, typecheck, build, format green

**Next**
- Core `ClientEntry` + local hash chain, `POST /v1/audit/batch`, then `HttpGate`, `HybridGate`, outbox, worker, backpressure, shutdown

**Notes for Abdullah**
- When writing PEM files from PowerShell, use `Out-File -Encoding ascii` (or Git Bash); `>` writes UTF-16, which key parsers reject

### 2026-10-12 · Session 10 · Phase 2 — hybrid mode, shared enums, API_ENDPOINTS

**Done**
- Core: `ClientEntry` + `chainClientEntry()` / `hashClientEntry()`, `GateDecision` schema, shared enums (`Verdict`, `BlockReason`, `ClientBlockReason`, `ClientEntryKind`, `ReportOutcome`), `API_ENDPOINTS` + `apiPath()`
- Server: `POST /v1/audit/batch` (token de-duplication, chain check, re-run `check()`, gap/edit/forgery/truncation flags, idempotent); report bookkeeping shared between `/v1/report` and batch ingest; every controller on `API_ENDPOINTS`
- SDK: `HttpClient`, `HttpGate`, `HybridGate`, `MemoryOutbox` / `FileOutbox`, `OutboxWorker`, SIGTERM/SIGINT flush; `jose` remote JWKS
- Integration tests through the real SDK gates: remote plan/check/report, hold approve + expiry, hybrid = remote decisions, outage → keeps deciding → `audit_backlog` → recovers, crash → restart uploads exactly once (also with a lost ack), edited line / forged verdict / dropped line all flagged and the server chain still verifies

**Problems hit and how they were solved**
- Hybrid client blocked everything as `invalid_token` when the server went down before its first check (JWKS never fetched) → prefetch the JWKS in `start()`; the server's mismatch rule flagged those safe blocks → flag only looser-than-policy decisions (ADR-038)
- The SDK's string literals (`"block"`, `"check"`, `"ok"`) slipped past the server-only enum rule → shared core enums (ADR-039)
- First run of the new e2e file timed out in `beforeAll` (cold transform of the freshly built SDK) → e2e `hookTimeout` 30 s
- `apps/server/test` could not import the SDK under the import-boundary lint → test-only exception (ADR-038)

**Decisions** (link ADRs)
- ADR-038: hybrid wire format, ingest rules, SDK gates · ADR-039: shared enums and `API_ENDPOINTS`

**Numbers**
- core 147, sdk 23, server 112 tests; whole monorepo lint, typecheck, test, build, format green

**Next**
- `packages/cli` (audit verify, keygen, policy validate, then the API commands) and `scripts/issue-license.ts`, then the Phase 2 acceptance walkthrough (curl sign → check → hold → approve → verify; HybridGate run with the server stopped mid-way)

**Notes for Abdullah**
- Phase 3 will need a `refresh` method on the `Gate` interface (guard rule 6); that is a public SDK API change, so I will ask before adding it

### 2026-10-12 · Session 11 · Phase 2 — CLI, license issuer, acceptance

**Done**
- `packages/cli`: `audit verify --file`, `keygen`, `policy validate` (offline); `login`, `users add|list|disable|token`, `agents create|list|disable`, `keys create|list|revoke --agent`, `policy pull|test|push --agent` (stored session)
- `scripts/issue-license.ts` (`pnpm issue-license`), verified end to end against the server's `verifyLicense` and the vendor public key that ships in the server
- Removed every code comment added in sessions 10–11; CLAUDE.md now says: no code comments
- Phase 2 acceptance: curl walkthrough and a HybridGate run with the server killed mid-way (below)

**Acceptance: curl walkthrough** (fresh database, server on :3100, secrets masked)

```text
$ intentlock login --url http://localhost:3100 --email admin@acme-demo.dev --token <from server log>
Signed in as admin@acme-demo.dev (admin)

$ intentlock users add approver@acme-demo.dev --role approver
Added approver@acme-demo.dev (approver)
Login token (shown once): …

$ intentlock users add alice@acme-demo.dev --role member
Added alice@acme-demo.dev (member)
Login token (shown once): …

$ intentlock agents create github-assistant
Created github-assistant (cmv5bgw490004z0vt0rd04bi4) with the starter policy as v1

$ intentlock keys create --agent github-assistant --name walkthrough
Key cmv5bgxl00007z0vtw3civbnx (il_live_7Ilh…) for github-assistant
INTENTLOCK_API_KEY=il_live_…
Shown once: store it in the agent app's secrets now.

$ intentlock policy push --agent github-assistant -m Hold public comments policy.yaml
Published github-assistant v2 (was v1)

$ curl -X POST http://localhost:3100/v1/plans # agent signs a plan for alice
{"planId":"01M4R6FB0PBB7K858T0BVE3RVC","token":"…","planHash":"xziXTccduGEtpNJeCHO0osjHOsWzgj-f-wSjIdx6ogk","policyVersion":2,"policyHash":"0E8KgKyajZFjDfYO_6EXHNHJe3NyXHLRq4NVm7R62B4","expiresAt":"2026-10-12T14:12:43.062Z"}

$ curl -X POST http://localhost:3100/v1/check # in plan, in scope
{"verdict":"allow","ruleId":"allow-in-plan","planStep":0}

$ curl -X POST http://localhost:3100/v1/check # off plan (the injected PR)
{"verdict":"block","ruleId":null,"reason":"not_in_plan"}

$ curl -X POST http://localhost:3100/v1/check # public comment → hold
{"verdict":"hold","ruleId":"hold-public-comments","planStep":1,"approvers":{"roles":["approver"],"emails":[],"self":false},"timeoutSeconds":300,"holdId":"cmv5bh2ml0009z0vtnd79b4jz"}

$ curl -X POST http://localhost:3100/v1/holds/cmv5bh2ml0009z0vtnd79b4jz/approve # with the API key → refused
401

$ curl -X POST http://localhost:3100/v1/auth/login # approver signs in
{"user":{"email":"approver@acme-demo.dev","role":"approver","groups":[]}}

$ curl -X POST http://localhost:3100/v1/holds/cmv5bh2ml0009z0vtnd79b4jz/approve # approver approves
approved

$ curl http://localhost:3100/v1/holds/cmv5bh2ml0009z0vtnd79b4jz/wait?timeout=5 # the waiting agent sees the decision
{"status":"approved"}

$ curl -X POST http://localhost:3100/v1/report # agent reports the run
{"planStatus":"active"}

$ curl http://localhost:3100/v1/audit/verify
{"ok":true,"count":13,"flagged":[]}

$ curl http://localhost:3100/v1/audit?format=jsonl > export.jsonl && intentlock audit verify --file export.jsonl
lines: 13
ok: 13 entries, chain intact
```

**Acceptance: HybridGate with the server stopped mid-way**

```text
13:58:15 signed plan 01M4R6GAV85ANMEJ60EAY37MH9 policy v2
13:58:16 check h1 github_list_issues(acme-demo/public-app) → allow allow-in-plan
13:58:16 check h2 github_list_issues(acme-demo/private-notes) → block not_in_plan
13:58:18 STOP_SERVER
13:58:23 check h3 github_list_issues(acme-demo/public-app) → allow allow-in-plan
13:58:23 check h4 github_create_pull_request(acme-demo/public-app) → block not_in_plan
13:58:23 check h5 github_list_issues(acme-demo/public-app) → allow allow-in-plan
13:58:23 upload failed: POST /v1/audit/batch failed
13:58:24 upload failed: POST /v1/audit/batch failed
13:58:25 START_SERVER
13:58:26 upload failed: POST /v1/audit/batch failed
13:58:30 upload failed: POST /v1/audit/batch failed
13:58:35 upload failed: POST /v1/audit/batch failed
13:58:46 upload failed: POST /v1/audit/batch failed
13:58:51 closed: outbox drained
```

After the restart and `close()`: `GET /v1/audit/verify` → `{"ok":true,"count":19,"flagged":[]}`; the five client entries are stored once each as `clientSeq` 1–5 (allow, block, allow, block, allow), none flagged; the run shows allow 3 / block 2. The outbox files stay on disk because that plan has no required steps, so it never completes; files are deleted only for completed, fully acked plans (ADR-038).

**Vendor keypair (for licenses), never committed**
- Generate: `node packages/cli/dist/bin.js keygen --out keys/vendor` (or `pnpm --filter @intentlock/cli build` first), then rename `keys/vendor/signing-key.pem` → `keys/vendor-private.pem`; `keys/` and `*.pem` are git-ignored
- Put the public half (`signing-key.pub.pem`) into `apps/server/src/license/constants/vendor-public-key.constant.ts` and release the server
- Issue: `pnpm issue-license --key keys/vendor-private.pem --licensee "Acme" --edition team --expires 2027-10-12 --max-users 25 --max-agents 10 --features multi_instance,audit_export --out acme.license`
- The pair in use today was generated on 2026-10-12 (ADR-035)

**Problems hit and how they were solved**
- `scripts/` has no package of its own → the script runs with root `tsx` and imports the server's schema by relative path, which also resolves the server's `zod`
- Docker Desktop was down again; on the first run after a cold Postgres start the bootstrap race test took 11 s (10 s limit) and failed once, then passed on every rerun (full server suite 115/115). If it recurs in CI, raise that test's timeout

**Decisions** (link ADRs)
- ADR-040: CLI and license issuer

**Numbers**
- core 147, sdk 23, cli 13, server 115 tests; whole monorepo lint, typecheck, test, build, format green

**Next**
- Phase 3: neutral provider types + `LLMProvider`, `FakeProvider`, OpenAI-compatible adapter, guard loop, Anthropic adapter

**Notes for Abdullah**
- Phase 3 needs a `refresh(planId, token)` method on the SDK `Gate` interface (guard rule 6) — a public API change I will ask about first
- Phase 3 also needs a free model option: a Gemini or Groq API key, or Ollama with a tool-calling model
- Phase 0 leftovers still open: npm scope + repo name, CI green on GitHub

### 2026-10-12 · Session 12 · Phase 3 — providers, guard loop, Anthropic adapter

**Done**
- 3a provider layer: neutral types + `LLMProvider`, `FakeProvider`, `OpenAICompatibleProvider`, `providerFromEnv()` (commit `ce2c2d0`)
- 3b guard loop: `createGuard` (start / execute / run), planner with forced `declare_plan` + retry + fail closed, explicit plans, concurrent checks, holds, token refresh, events, `defineTool`/`toolset`; `Gate.refresh` on all four SDK gates (commit `2482523`)
- 3c `AnthropicProvider` with fixture-driven tests; live tests for Anthropic (`RUN_LIVE_ANTHROPIC=1`, not run yet: no key) and the free model (`RUN_LIVE=1`), both skipped by default
- Default free model chosen after a live comparison: `gemini-3.5-flash-lite` (ADR-012); live smoke test passes

**Problems hit and how they were solved**
- Missing provider call ids fell back to `call_<index>`, which collided with a real `call_2` in the fixture → `call_<uuid>`
- zod's JSON Schema for core's `ArgConstraint` has `$ref`/`$defs` and a recursive JSON type, poor fit for free models → hand-written flat `declare_plan` schema, validated with core `Plan` afterwards (ADR-042)
- Refreshing within the same second returned a byte-identical token (Ed25519 is deterministic, same `iat`/`exp`) → the e2e test checks `expiresAt` and that the new token is accepted instead
- Python on Windows rewrote docs with CRLF in text mode → edits now keep the file's own newlines
- Gemini 3 returned 400 "Function call is missing a thought_signature" on the second turn → `ToolCallReq.providerData` carries `extra_content` back unchanged (ADR-044)
- `gemini-3.8-flash` / `gemini-3.5-flash` answered 503 "high demand", then 429 quota; `gemini-2.5-flash` is closed to new users (404); `gemma-4-31b-it` timed out → Flash-Lite, the only one that ran
- Docker Desktop stopped mid-session → restarted it and Postgres; the first test run after the restart hit P1001 because Postgres was not ready yet, rerun after `pg_isready` was green

**Decisions** (link ADRs)
- ADR-041: Provider layer details (`argsError`, `providerFromEnv` + anthropic factory)
- ADR-042: `Gate.refresh` and the guard loop (`guard.execute(session, calls)` instead of `execute(token, calls)`)
- ADR-043: Anthropic adapter mapping and live tests
- ADR-012: default free model `gemini-3.5-flash-lite`
- ADR-044: opaque `providerData` on tool calls (Gemini thought signatures)

**Numbers**
- guard 35 (+1 live, skipped), anthropic 6 (+1 live, skipped), sdk 26, server 116, core 147 tests
- Live smoke on `gemini-3.5-flash-lite`: 3/3 passed, ~10 s per run, 3 turns; events `plan_signed`, `block delete_repo not_in_plan` (9.9 ms), `plan_signed`, `allow list_issues` (5.0 ms), `allow add_label` (3.0 ms). The model ignored the injected "call delete_repo" in the issue body, so the block came from the direct off-plan call

**Live tests** (bypass turbo, which filters env vars and caches results)
- Free model: set `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` in `.env`, then `RUN_LIVE=1 pnpm --filter @intentlock/guard exec vitest run src/live.test.ts`
- Anthropic: `RUN_LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=… pnpm --filter @intentlock/anthropic exec vitest run src/live.test.ts`

**Next**
- Phase 3 acceptance met: guard + both adapters green, free-model live smoke passes, `LLM_PROVIDER` switch needs no code change, README example in `packages/guard`
- Phase 4: inbox (Next.js middleware + sign-in first)

**Notes for Abdullah**
- Your `.env` still says `LLM_PROVIDER=fake`, empty `LLM_BASE_URL`, `LLM_MODEL="gemini-3.8-flash"`; the live runs passed those as overrides. To use Gemini by default set `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, `LLM_MODEL=gemini-3.5-flash-lite`
- The Anthropic live test still waits for a key

### 2026-10-13 · Session 13 · Phase 4a — inbox foundation

**Done**
- `src/proxy.ts`: no session cookie → `/login?next=...` (Next 16 name for middleware)
- `/api/*` rewrite to the server, so the cookie is same-origin in dev as well
- `lib/api.ts`: typed client over `API_ENDPOINTS`, CSRF header on mutations, zod-parsed responses, `ApiError`, 401 → sign-in
- Sign-in page (email + login token, error messages for 401 / 429), sign-out from the account menu
- App shell: Overview · Activity · Holds · Agents · Audit, theme toggle, edition footer from `/v1/license`; the four non-overview pages are placeholders for the next chunks
- Inbox depends on `@intentlock/core` at runtime (ADR-029); scaffold `page.tsx` and `header.tsx` removed

**Problems hit and how they were solved**
- Docker Desktop was down again; it now lives under `%LOCALAPPDATA%\Programs\DockerDesktop`, not `Program Files`
- `middleware.ts` is deprecated in Next 16 → `proxy.ts` (ADR-045)

**Decisions** (link ADRs)
- ADR-045: inbox sign-in, proxy and API client

**Numbers**
- inbox 26 tests (proxy redirect + matcher, API client, `safeNext`, rewrite config); lint, typecheck green
- Live smoke (server on the test DB, inbox dev): signed out `/holds` → 307 `/login?next=%2Fholds`; `/api/v1/me` → 401; sign-in without CSRF header → 403; wrong token → 401; sign-in → 200 + httpOnly `il_session`; `/holds` → 200; `/v1/me`, `/v1/license` through the rewrite; sign-out → 204

**Next**
- Phase 4b: Overview, Activity and Run detail pages

**Notes for Abdullah**
- If your local `.env` has `NEXT_PUBLIC_API_URL`, rename it to `API_URL` (only needed when the server is not on `localhost:3000`)

### 2026-10-13 · Session 13 (cont.) · Phase 4b — Overview, Activity, Run detail

**Done**
- **Overview:** range (24 h / 7 d / 30 d) and agent filter; tiles for allowed / blocked / held, pending holds, median time to approve, flagged entries, audit lag; stacked verdict chart (Recharts); top blocked tools and rules linking into Activity
- **Activity:** URL-driven filters (search, agent, verdict, user, tool, rule, policy version, from/to), "Load more" paging, JSONL export, links to run detail, flagged marker
- **Run detail:** plan meta (agent, user, status, policy version, hash, signed/expires, duration), plan steps, ordered tool calls with offset, args, verdict, rule, reason, approval (status, approver, wait, note) and reported outcome; 404 shown as "not found or not yours"
- `useApi` hook, `request()` split out of `api()`, shared verdict badge / native select / agent filter

**Problems hit and how they were solved**
- Recharts' `dataKey` typing rejects string-enum keys → accessor function
- A dev server left over from the first chunk kept port 3001 and returned 500 on the new routes (Recharts was installed after it started) → killed and restarted
- Git Bash rewrote `/runs/...` curl arguments into `C:/Program Files/Git/...` → `MSYS_NO_PATHCONV=1`
- A bash heredoc batch failed on quoting and wrote nothing → wrote those files with the editor tool

**Decisions** (link ADRs)
- ADR-046: Overview, Activity and Run detail

**Numbers**
- inbox 33 tests; lint, typecheck, `next build` green
- Live (server on the test DB): an agent with a hold rule and one run through `HttpGate`: list_issues allow, get_issue allow, get_file_contents block (not_in_plan), create_pull_request block, post_comment hold. Every `/v1/stats/overview`, `/v1/audit`, `/v1/runs/:id` and `/v1/agents` response parses with the inbox schemas; `/`, `/activity`, `/runs/:id`, `/holds` render 200; JSONL export 200 `application/x-ndjson`
- Approving your own hold returns 403 `not_an_approver` (by design), so the smoke hold stays pending for the Holds chunk

**Next**
- Phase 4c: Holds (live list + approve/reject) and Agents (keys, create/revoke)

### 2026-10-13 · Session 13 (cont.) · Phase 4c — Holds and Agents

**Done**
- **Holds:** live list (Socket.IO + 10 s polling), "waiting for you" vs "waiting for someone else", approve/reject with an optional note, toasts for the 409/403 cases, link to the run
- **Agents:** list with status, policy version, active keys, 24 h counts; admin create form (kebab-case name, starter policy); agent page tabs Overview · Policy (read-only active source for now) · API keys (admin) · Activity
- **API keys:** create (shown once, copy button), list with prefix / created / last used, revoke
- `useMe()` from the app shell for UI role checks; `socket.io-client` added (approved)
- Server: `/events` gateway accepts the handshake path without a trailing slash (+ e2e test)

**Problems hit and how they were solved**
- Socket.IO through the `/api` rewrite failed: Next answered `308` to `/api/socket.io/` and the server only matched `/socket.io/` → `addTrailingSlash: false` on gateway and client (ADR-047); checked the new test fails without it
- Scratchpad scripts could not resolve bare package imports → imported `socket.io-client` and the SDK by file URL
- A full server run had one failure while my dev server was running against the same test database; the rerun was 117/117 (or the known bootstrap timing flake)

**Decisions** (link ADRs)
- ADR-047: inbox holds, agents and live events

**Numbers**
- inbox 33 tests, server 117 tests; inbox + server lint, typecheck green
- Live through the inbox origin: socket connected and upgraded to `websocket`; a member's `post_comment` held; the admin saw `canApprove: true`, approved with a note (`approved`); a second resolve got 409; socket got `decision`, `hold.created`, `hold.resolved`; a revoked key could no longer sign plans (401)

**Next**
- Phase 4d: policy editor, Audit page, role checks across the UI

**Notes for Abdullah**
- Hold and key views name people by user **id** (`resolvedBy`, `createdBy`), so Run detail shows an id after "by". Showing emails needs the server to return them (an API shape change), so I will ask before doing it

### 2026-10-13 · Session 13 (cont.) · Phase 4d — Policy editor, Audit, role checks

**Done**
- **Policy tab:** CodeMirror YAML editor with inline lint from `@intentlock/core`, "show changes vs active" diff, publish with message, 409 handling with rebase, server error display, read-only for non-admins
- **Test panel:** sample calls (JSON) + replay last N; verdict-change summary and per-call before/after
- **History:** versions with message and "copy of vN", side-by-side diff vs active, rollback (admin)
- **Audit page:** verify the chain; intact/broken and flagged entries
- **Role checks:** `can(role, UiAction)` mirrors the server's `@Roles`; agent create, API keys tab, policy edit/publish/rollback hidden or read-only by role; test panel for admins and approvers
- `ApiError` now keeps the response body (for `activeVersion` on 409 and line/col errors on 400)

**Problems hit and how they were solved**
- My first smoke draft turned a `hold` rule into `block` but kept `approvers`; the inbox lint flagged it and the server rejected it with the same message, which is the behaviour we want
- The editor's own value sync fired `onChange` and marked the policy as edited → the update listener ignores changes equal to the last known text

**Decisions** (link ADRs)
- ADR-048: policy editor, audit page and UI role checks

**Numbers**
- inbox 40 tests; lint, typecheck, build green
- Live through the inbox origin (agent `github-assistant`, active v2): lint and server agree on a broken draft; test with 1 sample + replay 50 → 6 results, `hold → block × 2`; stale publish → 409 `activeVersion: 2`; invalid publish → 400 with line 3 col 10; publish → v3; rollback → v4 copy of v2; verify → ok, 22 entries, no flagged; member → 403 on publish, test, create agent, list keys; 200 on reading the policy and verify
- Pages `/agents/:id?tab=policy|api-keys`, `/audit`, `/agents`, `/holds`, `/` render 200

**Next**
- Phase 4e: GitHub demo agent (needs the throwaway GitHub accounts + PAT from Abdullah)

**Notes for Abdullah**
- Still open from 4c: should hold and key responses carry emails instead of user ids (`resolvedBy`, `createdBy`)?

### 2026-10-13 · Session 13 (cont.) · Emails instead of user ids

**Done**
- Hold views (`/v1/holds`, approve/reject, run detail) and API key lists return emails in `resolvedBy` / `createdBy` (approved by Abdullah); the inbox keys table gained a "Created by" column, and Run detail now reads "by alice@…"

**Decisions** (link ADRs)
- ADR-049: hold and API key views name people by email

**Numbers**
- server holds + agents e2e 19/19 (new test: approver email in the hold list and run detail; key list `createdBy` = admin email); server + inbox lint and typecheck green; inbox 40 tests

### 2026-10-13 · Session 13 (cont.) · Phase 4e — GitHub demo agent (part 1)

**Done**
- Abdullah created the throwaway account `acme-demo-bot-1` with `public-app` and `private-repo` and a fine-grained PAT (expires 2026-11-12) over both
- `apps/demo`: Octokit tools (list/get issue, add label, draft reply, post comment, get file, list repos, create PR) with zod schemas; `policies/github-assistant.yaml`; forced-attack `FakeProvider` script; `build-agent` + `run` CLI (protected = `HybridGate`, unprotected = `PassThroughGate`); `setup-instance`; `seed`
- Tests: tools against a fake Octokit, policy rule table, and the whole forced attack offline through `LocalGate` with the real policy (unprotected leaks the private file into a PR; protected blocks list_repos, the private read and the PR before they run)

**Problems hit and how they were solved**
- `pnpm setup` ran pnpm's built-in setup instead of our script; it added `PNPM_HOME` and prepended `%PNPM_HOME%` to the user Path (Windows user environment) → script renamed to `setup-instance`; told Abdullah, offered to revert
- Running `seed` twice within seconds created a duplicate issue (GitHub list lag) → closed #3
- Docker Desktop was down again → restarted
- A bash heredoc turned `\\S` into `\S` inside a TS template literal (matching a literal `S`) → caught by the `hasValue` test, fixed in the editor
- Gemini free tier: `gemini-3.5-flash-lite` took minutes per call, then timed out after the plan was signed; both it and `gemini-3.8-flash` answered 503 "high demand" → real-model runs postponed

**Decisions** (link ADRs)
- ADR-050: GitHub demo agent, setup and seed

**Numbers**
- demo 21 tests; lint, typecheck green
- Live against a fresh test-DB server and real GitHub: setup created member alice, agent, policy v2, key (second run: no changes); seed opened #1 (poisoned) and #2 (benign); protected forced run: list_issues allow, get_issue #1 allow, list_repos / get_file_contents(private-repo/notes.md) / create_pull_request block (`not_in_plan`), model text explains the block
- The free model's declared plan had no `repo` constraints; the policy's `only-public-app` rule covers that

**Next**
- When Gemini is back (or with Groq/Ollama): real protected run with comment holds approved by the admin and posted to GitHub; unprotected run (opens a real public PR with `notes.md`)
- Phase 4f: split-screen `/demo` page, server demo seed (`INTENTLOCK_DEMO=1`)

**Notes for Abdullah**
- `private-repo/notes.md` holds your local dev DB URLs; replace it with obviously fake secrets before recording
- To set up your dev instance: put `INTENTLOCK_ADMIN_EMAIL` / `INTENTLOCK_ADMIN_TOKEN` in `.env`, then `pnpm --filter @intentlock/demo run setup-instance`

### 2026-10-13 · Session 13 (cont.) · Phase 4f — split-screen demo, demo users

**Done**
- Demo runner (`run runner`): both modes side by side, SSE on 127.0.0.1:8790, header-guarded start, failures reported per mode
- Inbox `/demo` page + nav entry: "Run both", two panes (without / with Intentlock), forced-attack banner, task, final answers; `/demo-runner/*` rewrite
- Server demo users: e2e test for `INTENTLOCK_DEMO=1` bootstrap; `DEMO_USER` default → `member@acme-demo.dev`

**Problems hit and how they were solved**
- Gemini still overloaded (503) → built the split screen against a fake runner instead; the real forced runner was not used because its unprotected half would open a real public PR with `notes.md`
- An inbox dev server from the previous session still held port 3001 (it reloaded the new rewrite on its own)

**Decisions** (link ADRs)
- ADR-051: split-screen demo runner and demo users

**Numbers**
- demo 24 tests (runner: both modes stream, failed mode reported, header required, 409 on a second start); inbox 43 (runner-event reducer: replay de-dup, new run replaces old, malformed dropped); server bootstrap e2e 2/2; lint, typecheck, builds green
- Through the dev rewrite: SSE frames arrived ~1 s apart as emitted (10 frames for two modes); `POST /demo-runner/runs` 202, without the header 400; `/demo` 200 signed in, 307 signed out

**Next**
- When Gemini recovers: real protected run (holds approved, comments posted), unprotected run (needs Abdullah's OK; replace `notes.md` first), then a full split-screen run in the browser; record backup clips (manual)

### 2026-10-14 · Session 13 (cont.) · Phase 4e — real-model protected run

**Done**
- `gemini-3.5-flash-lite` answered again (200 in 1.4 s; `gemini-3.8-flash` still 503). Fresh test-DB server, `setup-instance` (created `member@acme-demo.dev`, agent, policy v2, key), then a real protected run of `github-assistant`
- The model ignored the injection in #1 and did the task: list issues, read #1 and #2, labelled #2 `bug` and #1 `enhancement` (allowed), both replies **held** (`hold-public-comments`); approved as `admin@acme-demo.dev`; the agent then posted both comments to GitHub (issuecomment-6161987350 and -6161987351) and finished in 4 turns
- Audit for that plan: plan_signed, 5 allows, 2 holds, 2 hold_resolved (approved), 7 reports

**Notes**
- With this model the leak attempt never happens in a real run, so the blocked-leak half of the demo uses `DEMO_FORCE_ATTACK=1` (verified earlier against real GitHub: list_repos, the private read and the PR blocked, model explains). The protected task is ticked on that basis
- Docker Desktop was down again at the start of this session

**Next**
- Unprotected run (opens a real public PR with `notes.md`): waits for Abdullah's OK and fake contents in `notes.md`; backup clips

### 2026-10-14 · Session 13 (cont.) · Phase 4 wrap-up checks

**Done**
- `private-repo/notes.md` replaced with clearly fake demo secrets (commit b143d5d in the private demo repo)
- Full repo check before committing: prettier, lint, typecheck green everywhere; core, sdk, guard, anthropic, cli, inbox (43), demo (24), server (119) tests green

**Problems hit and how they were solved**
- The unprotected forced run (opens a real public PR with the fake notes) was refused by the agent's safety check → left for Abdullah to run himself
- My demo-users test signed in four times from one IP and hit the login rate limit (429) → it now checks each user's token hash in the database and signs in once
- `holds.e2e` "expires once, even when two instances run the expiry job together" failed once in the full suite (0 instead of 1) and passed 3/3 alone: under load the app's own expiry timer can expire the hold before the test's two `expireAll()` calls. Pre-existing timing flake; fix later by stopping the module's interval in that test

**Next**
- Abdullah: unprotected run (`DEMO_FORCE_ATTACK=1 pnpm --filter @intentlock/demo run github-assistant --mode unprotected`), backup clips
- Default branch → `main`, commit Phase 4 on `phase-4`

### 2026-10-13 · Session 14 · Test folder layout

**Done**
- Moved every test out of `src/`: unit tests to `<pkg>/test/unit/` mirroring `src/`, server e2e tests and their setup/helpers to `apps/server/test/e2e/` (ADR-052). Relative imports rewritten by a one-off script; vitest, tsconfig and guard eslint config updated; STRUCTURE.md and CLAUDE.md updated

**Problems hit and how they were solved**
- Five tests build paths from `import.meta` (demo policy files, license repo root, anthropic fixtures, guard `.env`) → each got one more `..`

**Decisions**
- ADR-052: Tests live in each package's test/ folder

**Numbers**
- typecheck, lint green; all tests green: core 147, server 119 (unit + e2e), inbox 43, guard 35, sdk 26, demo 24, cli 13, anthropic 6, evals 1

**Next**
- Unchanged from Session 13: unprotected demo run, backup clips
