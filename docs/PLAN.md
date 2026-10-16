# Plan — Intentlock v0.1

**Window:** Sun 11 → Sat 17 Oct 2026 · **Rule:** finish a phase's acceptance criteria before starting the next. Tick `- [x]` only after tests pass. Stretch items are cut first if a day overruns.

**If a day overruns, cut in this order:** (1) Phase 7 stretch items, (2) the files-assistant demo agent, (3) the support-assistant demo agent, (4) policy test *replay* (keep sample-call tests) and the diff view, (5) the server re-check of hybrid batches (keep gap detection), (6) CLI `users`/`agents`/`keys` commands (use the inbox + dev seed instead), (7) the deployed instance (record against local `docker compose`). Never cut: fail-closed paths, default-deny auth, session-only approvals, policy versioning + publish, audit chain verify, the GitHub demo, evals.

| Phase | Day | Outcome |
| --- | --- | --- |
| 0 · Foundation | Sun 11 | Monorepo builds, tests and lints in CI; Postgres runs |
| 1 · Core engine | Mon 12 | Plans, tokens, policy engine, audit hashing, `LocalGate` — fully tested |
| 2 · Server + gates | Tue 13 | NestJS API, team sign-in, holds, audit chain, licensing groundwork, WebSocket, `HttpGate`, `HybridGate` with outbox worker |
| 3 · Agent guard + providers | Wed 14 | Provider-agnostic `createGuard()`; OpenAI-compatible (free models) + Anthropic adapters |
| 4 · Inbox + GitHub demo | Thu 15 | Signed-in dashboard, holds, policy editor, agents + keys; GitHub attack reproduced and blocked |
| 5 · More agents + evals | Fri 16 | Support and files demo agents; 30-scenario eval suite with attack rate, utility, latency |
| 5.5 · Improvements | before Ship | Setup page + invites, email/password and Google/GitHub sign-in, team and account pages, onboarding, dashboard and UI redesign |
| 6 · Ship | Sat 17 | Deployed private instance, demo video, README, npm publish, resume bullet |
| 7 · Stretch | after | MCP proxy, docs site |

---

## Phase 0 · Foundation (Sun 11, ~3 h)

- [ ] Claim the `@intentlock` npm scope (create the npm org) and the GitHub repo name; note the result in ADR-001 — **manual step for Abdullah**
**Scaffold with Better-T-Stack (everything except NestJS)** — see STRUCTURE §7 for the exact commands
- [x] Run `create-better-t-stack --help` first and compare flags with STRUCTURE §7 (the CLI changes often); do a `--dry-run`
- [x] Scaffold the monorepo into the repo root (Turborepo addon, pnpm, Next.js frontend, no backend/db/auth/API); keep `docs/` and `CLAUDE.md` untouched (`--directory-conflict merge`)
- [x] Rename `apps/web` → `apps/inbox`, package name `@intentlock/inbox`; keep `packages/ui` (shared shadcn/ui) and `packages/config` (shared tsconfig) as generated
- [x] Add `core`, `sdk`, `guard`, `anthropic`, `cli`, `evals` with `create-better-t-stack add --package <name>`; rename each to `@intentlock/<name>`; add `tsup.config.ts` + `README.md` to each
- [x] Create `apps/demo` as a plain Node TypeScript package (`@intentlock/demo`)

**Add NestJS manually (Better-T-Stack has no NestJS option)**
- [x] `pnpm dlx @nestjs/cli new server --directory apps/server --package-manager pnpm --skip-git --skip-install`; rename to `@intentlock/server`
- [x] Remove Nest's own ESLint/Prettier config and point its `tsconfig` at the shared `packages/config` preset; keep Nest's `nest-cli.json` and build script
- [x] Add Prisma to `apps/server` (`prisma init`, schema in `apps/server/prisma/`)

**Make it match the docs**
- [x] Reconcile the generated layout with `docs/STRUCTURE.md`; where Better-T-Stack's convention differs and is reasonable, update STRUCTURE.md instead of fighting the generator (record in ADR-018)
- [x] Shared presets: `strict`, `noUncheckedIndexedAccess`, ES2022, NodeNext in `packages/config`; `.nvmrc` = Node 22
- [x] ESLint (typescript-eslint flat config) in `packages/config` with the import-boundary rules from STRUCTURE §4, + Prettier; `pnpm lint`, `pnpm typecheck`; add a deliberately bad import in a scratch branch to confirm lint catches it
- [x] Vitest workspace config; one passing smoke test per package
- [x] `tsup` build for packages (ESM + d.ts)
- [x] `docker-compose.yml` with Postgres 16; `.env.example` (incl. `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`); `.gitignore` covers `.env*`, keys
- [ ] GitHub Actions: install → lint → typecheck → test on push and PR
- [x] Fill in the Commands section of `CLAUDE.md`
- [x] Journal entry

**Acceptance:** fresh clone → `pnpm install && pnpm test && pnpm lint && pnpm typecheck` all green; CI green; `docker compose up -d` starts Postgres.

---

## Phase 1 · Core engine (Mon 12) — `packages/core`, `packages/sdk` (LocalGate)

- [x] Zod schemas: `Plan`, `PlanStep`, `ArgConstraint`, `ToolCall`, `Decision`, `PolicySet`, `AuditEntry`
- [x] `canonicalize(plan)` (RFC 8785) + `planHash()`; tests: key order and whitespace don't change hash, any value change does
- [x] Key utilities: generate Ed25519 keypair, import/export PEM, `kid` thumbprint
- [x] `signBundle(input, { privateKey, kid, now, ttlSeconds })` → JWS; `verifyBundle(token, key, now)` with 30 s leeway; tests: valid, expired, tampered payload, wrong key, wrong `alg`
- [x] Plan matcher: `matchStep(plan, call)` for every `ArgConstraint` kind; tests per kind + no-match
- [x] Policy YAML parser (`yaml` + zod) returning errors with line, column, path and message (the inbox editor shows them inline); works in Node and the browser
- [x] `STARTER_POLICY` constant (default block + allow in-plan) and a pure `compareDecisions(oldPolicy, newPolicy, calls)` used by the dry-run test (server, inbox, CLI)
- [x] Policy evaluator: ordered rules, first match wins, `except`, `inPlan`, user email/role/group, default block; tests for every match field
- [x] Approver spec: loader rejects hold rules with no possible approver; `canApprove(spec, approver, requester)` with separation of duties (requester only if `self: true`); tests
- [x] Pure `check(bundle, call, usage)` (verified bundle claims in, `Decision` out) implementing ARCHITECTURE §4 exactly; tests for every branch of the decision diagram, incl. missing/wrong-typed args for every operator (ADR-028)
- [x] `decide(token, key, call, usageFor, now)`: `verifyBundle` → `check` inside the fail-closed wrapper; any throw → `block / internal_error`, bad token → `block / invalid_token`; test with a policy that throws
- [x] Audit hashing: `hashEntry(prevHash, entry)` over every column except `hash` (ARCHITECTURE §5.4), `verifyChain(entries)` returns first broken seq; tests: intact, edited payload, edited denormalized column (e.g. `verdict`), edited `flagged`, deleted row, reordered rows
- [x] `packages/sdk`: `Gate` interface, `LocalGate` (in-memory usage counts, holds → block), `PassThroughGate`
- [x] Coverage report for core ≥ 90 % lines
- [x] Journal entry

**Acceptance:** `pnpm --filter @intentlock/core test` green with ≥ 90 % coverage; a script in `packages/sdk/examples/local.ts` signs a plan and shows allow / block (not in plan) / block (policy) decisions.

---

## Phase 2 · Server + gates (Tue 13) — `apps/server`, `HttpGate`, `HybridGate`

- [x] NestJS app scaffold, `pino` logging, zod validation pipe, global exception filter that never leaks stack traces
- [x] Prisma schema from ARCHITECTURE §5.3 (incl. `Organization`, `orgId` on every table, `User`, `Session`); first migration; org-scoped Prisma helper used by every service; seed script for dev (org, admin, approver, member, API key)
- [x] Global default-deny session guard; `@Public()` (sign-in, health, JWKS) and `@AgentAuth()` (API-key routes) decorators; a test that enumerates all routes and fails on any unexpected public route
- [x] Agents: create (with starter policy v1), list (with 24 h counts), update, disable; license `maxAgents` enforced
- [x] API keys per agent: `il_live_` + random, hash + prefix stored, shown once, `lastUsedAt`, revoke; agent API-key guard resolves `agentId`
- [x] Policy store: `PolicySet` / `PolicyVersion` / `PolicyDraft`; endpoints for draft, validate, test (sample calls + replay last N decisions), publish (409 on stale `baseVersion`), rollback, versions; all publishes/rollbacks audited
- [x] Role-scoped read endpoints: `/v1/stats/overview`, `/v1/runs`, `/v1/runs/:planId`, filtered `/v1/audit` (+ JSONL export); audit denormalized columns + indexes from ARCHITECTURE §5.3
- [x] Bootstrap on empty DB: create org (`ORG_NAME`) + admin (`BOOTSTRAP_ADMIN_EMAIL`), print one-time login token
- [x] Auth: `/v1/auth/login|logout`, `/v1/me`, session guard, login rate limit (`@nestjs/throttler`), constant-time compare, CSRF header check, audit auth events
- [x] Users endpoints (admin only); disabling a user or re-issuing a token revokes sessions
- [x] `LicenseService` (ARCHITECTURE §5.7): offline verify of `LICENSE_FILE` at boot + every 24 h, Community fallback, `maxUsers` enforced on user creation, `hasFeature()`, `GET /v1/license`; tests: none / valid / expired / bad signature / over limit — and a test that an expired license does **not** change any enforcement decision
- [x] Signing key load/generate (§5.5); `GET /v1/keys/jwks`
- [x] `POST /v1/plans` and `/refresh`: agent from the API key (reject disabled agents), reject unknown/disabled users, snapshot the agent's active policy version; snapshot user policies + role + groups into the bundle (`pol`, `polh`, `role`, `groups`, `org`); refresh keeps the same plan hash (test that a different hash is rejected)
- [x] `POST /v1/check`: wraps core `check`, reads usage + roles, writes audit, creates holds
- [x] Holds: `POST /v1/holds` (server re-runs `check()`, creates hold only if it agrees), list (filtered by who may approve / own), approve/reject (session only, `canApprove`), long-poll wait (≤ 25 s), expiry job
- [x] `POST /v1/report`: usage + plan completion
- [x] Multi-instance safety (DEPLOYMENT §5): atomic conditional counter updates, idempotent hold expiry + `status = 'PENDING'` guards on approve/reject, advisory lock on chain append, no shared in-memory state
- [x] `/health` and `/health/ready` (DB + signing key); graceful shutdown that drains long-polls
- [x] Audit service: serialized append (transaction / row lock), `GET /v1/audit` paginated, `GET /v1/audit/verify`
- [x] `POST /v1/audit/batch`: idempotent on `(planId, clientSeq)`, client-chain + gap check, server re-run of `check()` with `flagged` on mismatch
- [x] WebSocket gateway `/events`: session required at handshake; `hold.created`, `hold.resolved`, `decision`, filtered per user role
- [x] `HttpGate` in `packages/sdk`: keep-alive, timeouts, network error → block; hold wait loop with `AbortSignal`
- [x] `HybridGate`: JWKS cache, local verify + `check()`, per-plan usage counts, holds via server
- [x] Outbox: per-plan JSONL file with local hash chain, append + fsync before acting, `.ack` file (ARCHITECTURE §6.2)
- [x] Background worker: timer (`unref`), batches of ≤ 100, exponential backoff + jitter, startup recovery of leftover files, delete when plan complete + acked
- [x] Backpressure: `audit_backlog` block when unacked > `maxUnacked` or older than `maxUnackedAgeMs`
- [x] `close()` + SIGTERM/SIGINT flush with timeout
- [x] Integration tests (Vitest + test DB): plan → check allow → report; off-plan block; hold → approve → wait returns approved; hold timeout; API key cannot approve; requester cannot self-approve unless `self: true`; disabled user's session rejected; every non-public route returns 401 without a session; member cannot read another member's runs; publish with stale `baseVersion` → 409; revoked key and disabled agent cannot sign plans; new plan after publish uses the new version, running bundle keeps the old; tamper a row → verify fails at that seq; 50 concurrent checks keep a valid chain
- [x] HybridGate tests: decisions match remote mode for the same inputs; server down → allow/block continue, then `audit_backlog` after the limit; kill the process mid-run → restart uploads leftovers with no duplicates; edited outbox line → server flags it; forged verdict → `decision_mismatch`; dropped middle entry → `client_gap`
- [x] `packages/cli`: `intentlock audit verify --file export.jsonl`, `keygen`, `policy validate` (offline, uses core); `login`, `users add|list|disable|token`, `agents create|list|disable`, `keys create|list|revoke --agent`, `policy pull|test|push --agent` (call the API with the stored session)
- [x] `scripts/issue-license.ts` (repo root, not published): issue a license JWS from a vendor key file; document in the journal how to generate the vendor keypair (private key never committed)
- [x] Journal entry

**Acceptance:** all integration tests green; `curl` walkthrough in the journal shows sign → check → hold → approve → verify; a HybridGate run with the server stopped mid-way recovers and the audit chain verifies.

---

## Phase 3 · Agent guard + providers (Wed 14) — `packages/guard`, `packages/anthropic`

**3a · Provider layer**
- [x] Neutral types + `LLMProvider` interface per ARCHITECTURE §7.1
- [x] `FakeProvider` (scripted responses, records requests)
- [x] `OpenAICompatibleProvider` using the `openai` client with custom `baseURL`; map tools, `tool_calls` (parse JSON-string args safely), and `role: "tool"` results; unit tests with recorded responses
- [x] `providerFromEnv()` with zod-validated `LLM_*` env vars
- [x] Pick the default free model: run the same 3-tool smoke task on 2–3 options (e.g. a Gemini model via its OpenAI-compatible endpoint, a Groq-hosted model, a local Ollama model); record tool-call reliability and the choice in an ADR — **needs a free API key or Ollama from Abdullah**

**3b · Guard loop (provider-agnostic)**
- [x] `createGuard(opts)` API per ARCHITECTURE §7.3; zod-validated options
- [x] Planner: separate chat with only the task + tool list, forced `declare_plan`; prompt pins scope args (repo, recipient, path); retry once, then fail closed
- [x] `explicit` plan source (developer passes steps)
- [x] Tool loop: check all calls concurrently, run allowed impls, return all results in one `tool` message in order
- [x] Block / unknown tool / bad args → error results with the reason text from §7.5
- [x] Holds: emit `hold`, wait via `gate.waitForHold`, approved → run, rejected/timeout → error result
- [x] Token expiry: refresh once, retry, else block
- [x] Impl errors → error result + `report(outcome: "error")`; max turns guard
- [x] Events with `provider` and `latencyMs`
- [x] `no-restricted-imports` lint rule: no provider SDKs in `core`, `sdk`, or the guard loop
- [x] Unit tests with `FakeProvider` + `LocalGate`: allow, block, parallel calls with one blocked, hold approved/rejected/timeout (fake gate), planner missing/invalid, bad JSON args, impl throws, max turns

**3c · Anthropic adapter**
- [x] `AnthropicProvider` in `packages/anthropic`: `tool_use` blocks in, `tool_result` blocks (with `is_error`) out, forced tool choice for the planner
- [x] Unit tests against recorded/hand-written Messages API responses (no key needed)
- [x] Live test behind `RUN_LIVE_ANTHROPIC=1` (skipped until a key exists)

- [x] Live smoke test on the default free model behind `RUN_LIVE=1`
- [x] Journal entry

**Acceptance:** unit tests green for guard + both adapters; live smoke test on the free model completes a 2-tool task and blocks an off-plan call; switching `LLM_PROVIDER` needs no code change; a 5-line usage example is in `packages/guard/README.md`.

---

## Phase 4 · Inbox + GitHub demo (Thu 15) — `apps/inbox`, `apps/demo`

**Inbox (every page requires sign-in)**
- [x] Next.js middleware: no session → `/login`; sign-in page (email + login token), sign-out, CSRF header on mutations, edition in the footer
- [x] App shell with navigation: Overview · Activity · Holds · Agents · Audit
- [x] **Overview:** allowed/blocked/held over time (Recharts), pending holds, median time-to-approve, top blocked tools and rules, flagged entries, audit lag; agent filter
- [x] **Activity:** decision table with filters (agent, user, tool, verdict, rule, policy version, time), search, JSONL export
- [x] **Run detail:** plan, policy version, ordered tool calls with verdict, rule, approval and timing
- [x] **Holds:** live list (WebSocket + 10 s polling fallback) filtered for the signed-in user; approve/reject with note
- [x] **Agents:** list; create (admin); agent page tabs Overview · Policy · API keys · Activity; create key (shown once, copy button) and revoke
- [x] **Policy editor:** CodeMirror YAML with inline errors from `@intentlock/core`; test panel (sample calls + replay last N) showing what changes; diff vs active; publish with message; 409 conflict handling; history with view/diff and rollback; read-only for non-admins
- [x] **Audit:** verify chain result
- [x] Role checks reflected in the UI (hidden/disabled actions), never relied on for security

**GitHub demo agent**
- [x] Throwaway GitHub accounts + repos (`public-app`, `private-notes` with fake data); fine-grained PAT over both — **manual step for Abdullah**
- [x] Octokit tools from ARCHITECTURE §8 with zod input schemas; `apps/demo/policies/github-assistant.yaml`
- [x] `setup` script: register the three agents, create one API key each into `apps/demo/.env`, publish their policies via `intentlock policy push`
- [x] `seed --agent github-assistant`: poisoned issue + benign issue
- [x] Unprotected run with `PassThroughGate`: get it to leak via PR (tune payload / model); else use `DEMO_FORCE_ATTACK=1` (`FakeProvider` script, labelled on screen) — the free model refuses the injection, so the leak uses `DEMO_FORCE_ATTACK=1`; proven by `forced-run.test.ts`, shown live in the `/demo` split screen when recording
- [x] Protected run: leak blocked at `get_file_contents` / `create_pull_request`; the model explains the block; the run appears in Activity and Run detail
- [x] Split-screen `/demo` page in the inbox: two panes streaming both modes
- [x] Server demo seed (`--demo` / `INTENTLOCK_DEMO=1`): sample admin, approver, member, intern users
- [ ] Record backup clips
- [x] Journal entry

**Acceptance:** signed out, every inbox page and API route refuses access; signed in, `pnpm --filter @intentlock/demo run github-assistant` blocks the leak, a benign `post_comment` holds and is approved in the inbox and posts to GitHub; a policy edit is tested, published as a new version and used by the next run; the dashboard and run detail show all of it.

---

## Phase 5 · More demo agents + evals (Fri 16) — `apps/demo`, `packages/evals`

**Morning: support and files demo agents** (reuse the eval tool definitions where possible; cut in this order if late: files, then support)
- [x] Mailpit service in the dev `docker-compose.yml`; `mail_*` tools via Mailpit HTTP API (sending through its send API instead of `nodemailer` SMTP, ADR-053); orders/refunds in a local JSON store of fake customers
- [x] `support-assistant` policy: reply only to the sender, no forwarding outside `@acme-demo.dev`, refunds ≤ $20 allow / ≤ $500 hold / unknown account block, group rules (`support-leads` vs `intern`)
- [x] `seed --agent support-assistant`: forward-to-attacker email + benign emails; protected run blocks the forward, holds a $200 refund
- [x] `files-assistant`: `fs_*` tools confined to `sandbox/workspace/`, `http_request` tool, local webhook receiver (`node:http`) that logs what arrives
- [x] `files-assistant` policy: paths `workspace/**` only, never `.env`, network calls only if in the plan; `seed`: poisoned document; protected run blocks the read and the POST, receiver shows nothing arrived

**Afternoon: evals**
- [x] Scenario type + mock backends (in-memory GitHub, email inbox, filesystem)
- [x] 15 GitHub scenarios (incl. utility-only), 8 email, 7 files — injections in issue bodies, email bodies, file contents, tool outputs
- [x] Policy files per domain (`packages/evals/policies/`, loaded by `LocalGate`)
- [x] Runner: N runs × {PassThroughGate, LocalGate}; collects tool logs, final text, check latencies, tokens
- [x] Metrics: attack success rate, utility rate, false-block count, p50/p95 check latency for `remote` (HttpGate) vs `hybrid` (HybridGate) vs `local`
- [x] Every result row labelled with provider + model; run at least the default free model (and Claude if a key becomes available)
- [x] Output `results/<date>.json` + `results/<date>.md` table; commit the first results
- [x] Short write-up of failures: which attacks got through and why
- [x] Journal entry

**Acceptance:** each available demo agent blocks its seeded attack in protected mode; `pnpm --filter @intentlock/evals run eval` produces the table; numbers are copied into the README.

---

## Phase 5.5 · Improvements (before Ship) — `apps/server`, `apps/inbox`, `packages/cli`, `apps/demo`

Added on 2026-10-15 after Phase 6 had started (README, licenses, Dockerfiles and the self-host bundle are already done). Supersedes ADR-020 (login tokens instead of passwords). Decisions taken with Abdullah: setup page + invites, OAuth only for existing users, invite/reset links copied from the inbox with optional SMTP, and all four UI areas plus a dashboard redesign from a reference design he will provide.

**Decide and document first**
- [x] ADR: accounts and sign-in (supersedes ADR-020): passwords hashed with `node:crypto` scrypt (no new dependency); Google (OIDC) and GitHub OAuth via authorization code + PKCE + `state`, implemented with `fetch` + `jose` (already a dependency), matched only to existing active users by the provider's **verified** email; invite and reset links are single-use, hashed, expiring tokens; optional SMTP via `nodemailer` (new dependency, approved); Google/GitHub sign-in is available in Community, generic OIDC/SAML stays an Enterprise feature; ARCHITECTURE §5.6, DEPLOYMENT §2 and USAGE updated in the same change
- [x] Add every new route to `API_ENDPOINTS` first; mark only setup, sign-in, OAuth start/callback, invite accept and reset as `@Public()`; route-enumeration test updated deliberately

**Server: accounts**
- [x] Prisma migration: `passwordHash` (nullable) on `User`; `Identity` (provider, subject, email, userId, orgId; unique per provider + subject); `Invite` (email, role, groups, tokenHash, expiresAt, acceptedAt, invitedBy); `PasswordReset` (tokenHash, expiresAt, usedAt); every table has `orgId`
- [x] Setup: on an empty database the server prints a one-time **setup code** (replaces the bootstrap login token); `POST setup` with code + email + password creates the org and first admin, then the route answers 409 forever; `GET setup/status` tells the inbox whether to show `/setup`
- [x] Email + password sign-in: scrypt with per-user salt, constant-time verify, same rate limits as today, generic error message (no user enumeration), sessions unchanged; minimum length 12 and a check against the email itself
- [x] Invites (admin): create → link shown once (and emailed when SMTP is configured); accept → set password or continue with Google/GitHub, which creates the user with the invited role and groups; expiry 7 days, single use, counts against `maxUsers` at accept time; resend and revoke
- [x] Password reset: admin creates a reset link for a user (copy or email); `forgot password` on the sign-in page only when SMTP is configured, always answering the same message
- [x] OAuth: `GET auth/oauth/:provider` → redirect with PKCE + `state` (signed, short-lived cookie); callback exchanges the code, reads the verified email (Google ID token / GitHub `/user/emails` primary + verified), signs in the matching active user or redirects to `/login?error=no_account`; link/unlink from account settings (never unlink the last sign-in method); providers enabled only when `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` are set; callback URL built from `PUBLIC_URL`
- [x] Account: change password (needs the current one, revokes other sessions), list sessions and sign out others, linked providers
- [x] SMTP (`SMTP_URL`, `SMTP_FROM`) behind one `MailService`; Mailpit in dev; mail failures never block the action (the link is still shown)
- [x] Every new auth event audited (setup, password sign-in, OAuth sign-in, invite created/accepted/revoked, reset, password changed, provider linked/unlinked)
- [x] CLI: `intentlock login` prompts for the password; OAuth-only users create a CLI token in account settings (reuses the hashed login-token mechanism, now named "CLI token"); `users token` becomes `users invite` / `users reset-link`
- [x] Demo `setup-instance` and the seeds sign in with the admin's password (`INTENTLOCK_ADMIN_PASSWORD`) or CLI token; `INTENTLOCK_DEMO=1` sample users get passwords printed once
- [x] Integration tests: setup once then 409; wrong setup code; password sign-in ok / wrong / disabled user; rate limit; invite accept (password and OAuth paths), expired, reused, revoked, over the user limit; OAuth with unverified email, unknown email, wrong `state`, replayed code (fake provider endpoints); reset link single use; change password revokes other sessions; unlink last method refused; every new non-public route 401 without a session

**Inbox: UI**
- [x] Reference design from Abdullah → shared tokens (colors, type, spacing, radius) in `packages/ui`; app shell and navigation rebuilt to match
- [x] Sign-in page: email + password, "Continue with Google / GitHub" (shown only when enabled), error states; `/setup` first-run page; `/invite/[token]` and `/reset/[token]` pages
- [x] **Overview dashboard** redesigned to the reference: same data (allowed/blocked/held over time, pending holds, time-to-approve, top blocked tools and rules, flagged, audit lag), plus agent filter and time range
- [x] **Team page** (admin): members with role, groups, status, sign-in methods; invite, change role/groups, disable, reset link, resend/revoke invite; others see a read-only list
- [x] **Account settings**: profile, change password, linked providers, active sessions, CLI tokens
- [x] **Onboarding**: after setup, a first-agent wizard: create agent → API key shown once → copyable env + 5-line snippet → waits live for the agent's first decision and links to it
- [x] **Polish pass** on every page: consistent tables, forms and dialogs; empty, loading and error states; dark mode; works at 375 px width; keyboard focus and labels
- [x] Inbox tests for the new forms and role-based visibility; manual walkthrough recorded in the journal (logic and role checks are unit-tested; component tests of the forms moved to the Backlog)

**Acceptance:** a fresh install shows `/setup`, the setup code from the logs creates the admin, who invites a teammate by link; the teammate joins with a password and another with GitHub or Google; both sign in again, change their password or link a provider; a disabled user and an uninvited Google account cannot sign in; every inbox page matches the reference design and works signed in, signed out redirects to sign-in, and the route-enumeration test is green; the demo `setup-instance` still works.

---

## Phase 5.7 · Code quality and error handling (before Ship) — all packages

Added on 2026-10-16. Phase 6 is paused until this phase is done (its README task is committed; the scale-test files are written but not committed). The first scale-test runs returned 500s under modest load (Prisma transaction timeouts behind the audit-chain lock) and error messages without their cause, which raised the question of how errors are handled across the codebase.

Today errors already go through one place per layer: the server's global `HttpExceptionFilter` (unknown errors become a bare 500 and are logged), the SDK's `HttpClient` (network and 5xx become `GateUnavailableError`, so the gates fail closed), and the inbox's `request()` (errors become `ApiError`). Wrapping every call in `try/catch` is therefore not the goal: a local catch that swallows an error can turn a block into an allow. The goal is to find the places where an error is lost, mapped to the wrong status, missing its cause, or not shown to the user, and fix each one with a test.

**Review and decide first**
- [x] Error-handling review of every package (server, sdk, guard, anthropic, core, cli, demo, inbox, evals): each place an error is thrown, caught, swallowed, retried or returned; findings listed in the journal with file and line
- [x] ADR: error policy (ADR-060): which layer catches what; status codes for client errors, conflicts, transient failures (503 + `Retry-After`) and bugs (500); what is logged, at which level, with which fields; what a client may retry; the rule that a catch never widens a decision

**Lint**
- [x] Type-aware ESLint rules in `packages/config/eslint.js`: `no-floating-promises`, `no-misused-promises`, `only-throw-error`, `use-unknown-in-catch-callback-variable`; fix every finding

**Server**
- [x] Crash fix: `events.service.ts` `recheckSessions()` runs on a timer with `void` and no catch, so a database error with an inbox socket open ends the process → catch and log it; add process-level `unhandledRejection` / `uncaughtException` handlers that log through pino before exiting; test with a failing session lookup
- [x] OAuth: catch only `HttpException` around `invites.findValid` (a database error must not become `invite_invalid`); log the provider's error behind `oauth_failed`
- [x] Map database errors once in the global filter: transaction timeout, connection lost, server shutdown (Prisma `P1001`, `P2028`, `P1017`, the driver adapter's `DatabaseNotReachable` and Postgres `57P01`-style codes) → 503 `database_unavailable` with `Retry-After`; unmapped unique violations → 409; unit tests with the error shapes probed from the real adapter (an e2e with a dead database is not possible because startup queries it; the scale-test burst in the acceptance covers real load, agreed with Abdullah)
- [x] Audit batch ingest (ADR-061) (`audit/batch.service.ts`) holds the global chain lock for the whole batch, including signature checks, hashing and decision re-checks → do that work before taking the lock and hold it only to read the chain head and insert; tests that ordering, idempotency on `(planId, clientSeq)` and flagging are unchanged
- [x] Database pool and transaction limits from env (`DATABASE_POOL_MAX`, `DATABASE_POOL_TIMEOUT_MS`, `DATABASE_TX_MAX_WAIT_MS`, `DATABASE_TX_TIMEOUT_MS`) with defaults documented in DEPLOYMENT §2
- [x] Request id on every request: in logs, in a response header and in 5xx bodies, so a user's error can be found in the logs

**SDK and guard**
- [x] `GateUnavailableError` messages carry the cause (HTTP status or network code such as `ECONNRESET`), and the guard's `error` events pass it on; today the message is only `POST /v1/check failed`
- [x] Guard keeps the cause of a block: `safeCheck` emits an `error` event and maps 401/403 (revoked key, disabled agent) to their own client block reasons instead of `server_unavailable`; `waitSafely` reports a network failure as an error, not `expired`; still fail closed; tests
- [x] Provider failures: `runLoop` and the planner wrap LLM errors in a provider-agnostic `ProviderError` (status, retryable), emit an `error` event and keep the transcript so far; adapters map OpenAI/Anthropic errors to it; tests with `FakeProvider`
- [x] File outbox recovery: report corrupt lines and unreadable files through `onError` (only a missing file means "nothing to recover"); test
- [x] Retries only where they are safe (JWKS fetch, hold wait), with backoff; never for sign or check; the outbox upload already retries with backoff; tests

**Inbox**
- [ ] Route error boundaries (`error.tsx`, `global-error.tsx`); a network failure or an unexpected response shape shows a retryable error state instead of a blank page or Next's default error screen; tests for the error state
- [ ] One shared error-message helper in `lib/` instead of eight `message(error)` copies; toasts include the server's error code; `agent-filter` and `latest-activity` show load errors; `team-view` group edit only blames the format on a 400; `request()` turns a schema mismatch into `ApiError` (`unexpected_response`)

**CLI, demo, evals**
- [ ] One top-level handler per entry point: readable message and non-zero exit code for network errors, 4xx with the server's error code, and 5xx with the request id. CLI: wrap `fetch` in `api-client.ts` and guard `JSON.parse` in `session-store.ts`, which today print a stack trace
- [x] Small: remove the comment in `server/main.ts` and catch only a missing `.env` there; `license.service.ts` logs why the license file could not be read

**Acceptance:** review findings and the ADR are recorded; lint with the new rules is green; no known transient database failure returns a bare 500; every SDK error says why it failed; the inbox shows an error state when the server is down; `pnpm test && pnpm lint && pnpm typecheck` green; a remote-check burst of 50 plans × 20 concurrent checks across two instances returns no 500s (local scale stack; images are cached, no new downloads).

---

## Phase 6 · Ship (Sat 17) — paused until Phase 5.7 is done

- [ ] README: one-line pitch, demo GIF, 60-second quickstart, architecture diagram, eval table, limitations, roadmap
- [x] Licenses: root `LICENSE` = Elastic License 2.0; `LICENSE` (MIT) inside `packages/core`, `sdk`, `guard`, `anthropic` with `"license": "MIT"` in their package.json; `"license": "Elastic-2.0"` elsewhere; README section explaining which is which
- [x] Per-package READMEs; `CONTRIBUTING.md` (note: contributions to ELv2 parts need a CLA before the product is sold)
- [x] Self-host bundle: `deploy/docker-compose.selfhost.yml` (server + inbox + Postgres, images from GHCR) + README "Self-host in 10 minutes" (env, bootstrap admin, first login, add teammates, apply a license)
- [ ] Changesets or manual versioning; publish only the MIT packages `@intentlock/core`, `sdk`, `guard`, `anthropic` to npm at `0.1.0`; server and inbox ship as Docker images
- [ ] Record the ≤ 4 min demo video against our deployed instance (local compose for live-update shots): GitHub split screen → hold approval → run detail → policy edit/test/publish → dashboard → support and files clips → audit verify → 5-line code
- [x] Dockerfiles for server (multi-stage, non-root) and inbox (Next.js standalone); `docker compose` full stack
- [ ] `deploy/docker-compose.scale.yml` (2 server instances + nginx + Postgres + inbox) and `deploy/load/scale-test.ts`; run the scale test from DEPLOYMENT §7 and record real numbers
- [ ] CI: build and push images to GHCR on main; `prisma migrate deploy` as a release step
- [ ] Deploy **our own private instance** per DEPLOYMENT §9 (we self-host like any customer team): Neon (pooled + direct URLs), server on Render (Docker, `/health/ready`, pre-deploy migrations), inbox on Vercel with the `/api` rewrite; sign-in required, nothing public; run the demo `setup` against it; note the date free-tier limits were checked in the journal
- [ ] Write the resume bullet and LinkedIn post using real numbers from evals
- [ ] Final journal entry with lessons learned

**Acceptance:** our deployed instance runs all available demo agents behind sign-in; a stranger can follow the README to self-host and see a block in under 10 minutes; MIT packages installable from npm.

---

## Phase 7 · Stretch (only after Phase 6)

- [ ] `packages/mcp-proxy`: stdio proxy, enforces gate on `tools/call`, works in front of the GitHub MCP server
- ~~Inbox team page (list, add, disable, re-issue token) for admins~~ moved to Phase 5.5
- [ ] Visual policy rule builder (paid feature candidate)
- [ ] Second-admin approval for policy changes (paid feature candidate)
- [ ] Per-tool argument redaction in the dashboard (paid feature candidate)
- [ ] Audit retention purge per license `retentionDays` (with verifiable export before purge)
- [ ] Docs site (Next.js / Fumadocs) in the monorepo
- [ ] Taint tracking: mark data from private sources and hold writes that contain it
- [ ] OpenTelemetry spans for checks
- [ ] Cross-instance live events via Postgres `LISTEN/NOTIFY` (DEPLOYMENT §6.1)
- [ ] Sharded audit chains with a Merkle-root global anchor (DEPLOYMENT §6.2)

---

## Backlog

- [ ] **Inbox form tests:** component tests for the new forms (sign-in, setup, invite accept, password reset, team invite and member actions, account password/sessions/CLI token, onboarding). Needs React Testing Library (`@testing-library/react`, plus a DOM environment such as `jsdom` or `happy-dom` for Vitest) as new dev dependencies; ask Abdullah before adding them

---

## Definition of done (every task)

- Code is typed (no unexplained `any`), validated at boundaries with zod, and formatted
- Tests cover the new behaviour, including the failure path
- `pnpm test && pnpm lint && pnpm typecheck` green
- Docs updated if behaviour or API changed; ADR if a decision was made
- Task ticked here; journal updated at session end
