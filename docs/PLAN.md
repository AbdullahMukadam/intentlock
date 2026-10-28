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
| 6.7 · MVP launch | after Ship | Releases, CI, "protect your own agent" guide, policy templates, key rotation, early users |
| 7 · Stretch | after | MCP proxy, docs site |
| 8 · Sellable | after 6.7 | One paid license (per seat / year), free limited mode, License page, expiry, retention purge, pricing (ADR-082) |
| 8.1 · Production basics | after 8 | 2FA, backup and restore, cross-instance events, metrics, signed images |

---

## Phase 0 · Foundation (Sun 11, ~3 h)

- [x] Claim the `@intentlock` npm scope (create the npm org) and the GitHub repo name; note the result in ADR-001 — **manual step for Abdullah**
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
- [x] GitHub Actions: install → lint → typecheck → test on push and PR
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
- [x] Route error boundaries (`error.tsx`, `global-error.tsx`); a network failure or an unexpected response shape shows a retryable error state instead of a blank page or Next's default error screen; tests for the error state
- [x] One shared error-message helper in `lib/` instead of eight `message(error)` copies; toasts include the server's error code; `agent-filter` and `latest-activity` show load errors; `team-view` group edit only blames the format on a 400; `request()` turns a schema mismatch into `ApiError` (`unexpected_response`)

**CLI, demo, evals**
- [x] One top-level handler per entry point: readable message and non-zero exit code for network errors, 4xx with the server's error code, and 5xx with the request id. CLI: wrap `fetch` in `api-client.ts` and guard `JSON.parse` in `session-store.ts`, which today print a stack trace
- [x] Small: remove the comment in `server/main.ts` and catch only a missing `.env` there; `license.service.ts` logs why the license file could not be read

**Acceptance:** review findings and the ADR are recorded; lint with the new rules is green; no known transient database failure returns a bare 500; every SDK error says why it failed; the inbox shows an error state when the server is down; `pnpm test && pnpm lint && pnpm typecheck` green; a remote-check burst of 50 plans × 20 concurrent checks across two instances returns no 500s (local scale stack; images are cached, no new downloads).

---

## Phase 6 · Ship (Sat 17)

- [ ] README: one-line pitch, demo GIF, 60-second quickstart, architecture diagram, eval table, limitations, roadmap
- [x] Licenses: root `LICENSE` = Elastic License 2.0; `LICENSE` (MIT) inside `packages/core`, `sdk`, `guard`, `anthropic` with `"license": "MIT"` in their package.json; `"license": "Elastic-2.0"` elsewhere; README section explaining which is which
- [x] Per-package READMEs; `CONTRIBUTING.md` (note: contributions to ELv2 parts need a CLA before the product is sold)
- [x] Self-host bundle: `deploy/docker-compose.selfhost.yml` (server + inbox + Postgres, images from GHCR) + README "Self-host in 10 minutes" (env, bootstrap admin, first login, add teammates, apply a license)
- [x] Changesets or manual versioning; publish only the MIT packages `@intentlock/core`, `sdk`, `guard`, `anthropic` to npm at `0.1.0`; server and inbox ship as Docker images
- [ ] Record the ≤ 4 min demo video against our deployed instance (local compose for live-update shots): GitHub split screen → hold approval → run detail → policy edit/test/publish → dashboard → support and files clips → audit verify → 5-line code
- [x] Dockerfiles for server (multi-stage, non-root) and inbox (Next.js standalone); `docker compose` full stack
- [x] `deploy/docker-compose.scale.yml` (2 server instances + nginx + Postgres + inbox) and `deploy/load/scale-test.ts`; run the scale test from DEPLOYMENT §7 and record real numbers
- [x] CI: build and push images to GHCR on main; `prisma migrate deploy` as a release step
- [x] Deploy **our own private instance** per DEPLOYMENT §9 (we self-host like any customer team): Neon (pooled + direct URLs), server on Render (Docker, `/health/ready`, pre-deploy migrations), inbox on Vercel with the `/api` rewrite; sign-in required, nothing public; run the demo `setup` against it; note the date free-tier limits were checked in the journal
- [ ] Write the resume bullet and LinkedIn post using real numbers from evals
- [ ] Final journal entry with lessons learned

**Acceptance:** our deployed instance runs all available demo agents behind sign-in; a stranger can follow the README to self-host and see a block in under 10 minutes; MIT packages installable from npm.

---

## Phase 6.5 · Speed (inbox and API) — `apps/inbox`, `apps/server`

Added on 2026-10-17 after the first deploy (Vercel → Render → Neon): switching pages in the inbox shows skeletons for a long time. Two causes are already visible: `useApi` keeps no cache, so every page switch refetches everything from zero, and every request crosses Vercel's proxy, a free Render instance and Neon, each with its own latency and cold start. Measure first, then fix the biggest causes; numbers before and after go in the journal.

**Measure first**
- [x] A `Server-Timing` header on every API response (total time and time spent in the database), next to the request id; the browser's Network tab then shows where each request spends its time
- [x] Measure every inbox page on the deployed instance: requests per page, which run one after another, time per request split into network / server / database; note the Vercel, Render and Neon regions and whether a cold start was involved; record the numbers in the journal
- [x] Count the database queries per request for the busiest routes (session check, `/v1/me`, `/v1/stats/overview`, `/v1/audit`, `/v1/holds`, `/v1/runs`); find the slow ones with `EXPLAIN ANALYZE` on Neon

**Deployment**
- [x] Render and Neon in the same region (a query that crosses regions costs ~100–200 ms each time); DEPLOYMENT §9 says which regions to pick together
- [x] Cold starts: Render sleeps after 15 idle minutes (~1 minute to wake) and Neon after 5; decide whether to accept them for the demo or keep the server warm (e.g. a scheduled ping, within the 750 free hours); document the choice

**Server**
- [x] Fewer round trips per request: the session check and the user it belongs to in one query; no repeated lookups of the same row within a request; missing indexes for the slow queries found above
- [x] Response compression for JSON if the platform does not already do it (check the `content-encoding` header first)

**Inbox: TanStack Query** (`@tanstack/react-query` is a new dependency; Abdullah asked for it, confirm before adding, ADR)
- [x] Replace `useApi` with TanStack Query: one `QueryClient` for the app; the existing `request()` with its zod schema as the query function (responses are still validated); query keys from the endpoint and its params
- [x] Cached data shows instantly when you come back to a page and refreshes in the background (`staleTime`, previous data kept while filters change); identical requests on one page are made once
- [x] Live updates through the cache: the socket events (`useEvents`) invalidate the matching queries instead of each component reloading itself; the 10 s holds poll becomes a `refetchInterval`
- [x] Mutations (approve/reject, publish, invite, keys) update or invalidate the affected queries, so lists change without a full reload
- [x] Retries follow ADR-060: none on 4xx, a few with backoff on network errors and 5xx
- [x] Security: the cache is cleared on sign-out and on any 401, so the next person on the same browser never sees the previous user's data (members only see their own runs)
- [x] Load next pages early where it is cheap: prefetch the data of a sidebar page on hover or focus
- [x] Tests: query keys, cache cleared on sign-out and 401, socket events invalidate the right queries, no retry on 4xx

**Acceptance:** the journal has the per-page numbers before and after; going back to a page already visited shows its data at once (no skeleton) and refreshes it in the background; the first load of a page on a warm instance is measured and its slowest request explained; signing out leaves no cached data behind; `pnpm test && pnpm lint && pnpm typecheck` green.

---

## Phase 6.6 · Public website (landing page and docs) — `apps/site`

Added on 2026-10-17 after Phase 6.5 was merged: visitors need a page that explains Intentlock and the documentation. First planned inside the inbox behind an env flag; changed the same day with Abdullah to a **separate static site in `apps/site`, built with Astro + Starlight**, so the inbox stays private with no exception ("nothing visible without signing in" is unchanged) and self-hosted teams never get marketing pages. Nothing depends on `apps/site`; anyone who does not want it can delete the folder. Replaces the Phase 7 docs-site item.

**Setup**
- [x] ADR: public website as its own Astro + Starlight app (`apps/site`), why not inside the inbox, why Astro over Fumadocs; removable; one source of truth for USAGE / DEPLOYMENT text
- [x] Ask before adding `astro`, `@astrojs/starlight` and `@tailwindcss/vite` (new dependencies, exact versions, ADR); ARCHITECTURE allowed dependencies
- [x] `apps/site`: `package.json` (`@intentlock/site`, private, ELv2), `astro.config.mjs` (static output, Starlight docs under `/docs`), Tailwind 4 with the theme tokens from `@intentlock/ui` (light and dark), `dev`/`build`/`typecheck`/`lint`/`test` scripts that Turbo picks up; `INBOX_URL` (build time) for the Sign in links; not in any Docker image or the self-host bundle
- [x] Removable: no package or app imports `apps/site`; deleting the folder leaves `pnpm install`, `build`, `test`, `lint`, `typecheck` working (STRUCTURE and README say so)

**Landing page** (`/`)
- [x] One page in the style of Abdullah's reference (framed grid with hatched sides, dotted hero, mono tags, two-tone headings, halftone art in CSS/SVG): what Intentlock does (declare → sign → check → allow / block / hold → audit) with a diagram, the main features (policies and versions, holds and the approval inbox, hybrid gate, audit chain verify, provider-agnostic guard, fail closed), how to run it (self-host bundle, free hosting), licensing (MIT SDKs, ELv2 server), a short code sample, links to Docs, GitHub and Sign in
- [x] Light and dark, works at phone width, accessible (headings, contrast, keyboard, skip link), page metadata and an Open Graph image
- [x] Static HTML; the only scripts on the landing page are the inline theme script and Astro's link prefetch (Starlight turns it on; 1.1 kB gzipped)

**Docs (Starlight, `/docs`)**
- [x] Sidebar, built-in search (Pagefind, static), theme matching the landing page
- [x] Pages: introduction; quick start (self-host bundle, first admin, first agent); concepts (plans and tokens, policies and versions, verdicts, holds, audit chain, hybrid vs remote gate); SDK guide (`core`, `sdk`, `guard`, `anthropic`, from USAGE); policy reference (every rule type); CLI; HTTP API (from `API_ENDPOINTS`); deployment (self-host, free hosting, env variables); security model; licensing
- [x] One source of truth: the user-facing text lives in the site; `docs/USAGE.md` and the user-facing parts of `docs/DEPLOYMENT.md` point to it instead of repeating it (per the ADR)
- [x] Code samples in the docs are type-checked against the packages in a test, and internal links are checked, so the docs cannot drift silently

**Deploy**
- [ ] Cloudflare Workers static assets for `apps/site` (Git-connected Workers Builds, `wrangler.jsonc`, ADR-069; was a second Vercel project); DEPLOYMENT §9 step; the inbox links to the docs (sidebar "Docs" → site URL, build-time env, hidden when unset)

**Acceptance:** `astro build` works locally (no font download) and the site runs on Cloudflare: `/` is the landing page, `/docs` is readable and searchable, light/dark and phone width checked; the inbox is unchanged and still private (its proxy tests untouched); deleting `apps/site` leaves the other apps' install, build and tests green; `pnpm test && pnpm lint && pnpm typecheck` green.

---

## Phase 6.7 · MVP launch — `docs`, `apps/site`, `packages/*`

Added on 2026-10-19 with Abdullah after reviewing an outside MVP list. The product is built; what is left is shipping it so a stranger can protect their own agent. npm publish and the deployed instance are done; the Phase 6 README and video can run in parallel. **Pitch:** "Your AI agent can only do what the task needs. Anything risky waits for a human. Everything is logged."

**Before launch**
- [x] Releases (npm `0.1.0` and the `0.1.0` images were already out): the self-host bundle defaults to the pinned tag (`INTENTLOCK_VERSION=0.1.0`, was `latest`); `CHANGELOG.md`; the upgrade steps were already in the README and self-host docs; `pnpm release` stops unless the bundle default and a `## X.Y.Z` changelog heading match the version (CI already existed, Phase 0 item ticked)
- [x] "Protect your own agent" guide in the docs site (`/docs/protect-your-agent/`, under Start here): wrap an existing agent in about 10 minutes with `createGuard()`, covering a hold on a risky action, a spending/amount limit, and reading the audit log, not only prompt injection; its code samples go through the docs type-check test
- [x] Policy templates (`/docs/reference/policy-templates/`: GitHub, email, payments and refunds, files, outbound HTTP; a site test parses every full policy in the docs and checks each template's verdicts) from the demo policies (GitHub, email/support with refund limits, file access); add a payments template only if it reuses existing rule types; each template passes `intentlock policy validate` in a test and is linked from the guide
- [x] Signing key backup and rotation: `SIGNING_KEY_PREVIOUS` already existed (ADR on keys); self-host docs "The signing key" now cover backup, planned rotation (wait 2 h: 60 min TTL + 60 min refresh window), a leaked key (no overlap, restart agent apps for the 10 min JWKS cache) and a lost key; unit test `keys.service.test.ts` (old token valid during the overlap, refused after, public-only previous key, unknown key, production without a key) instead of an e2e test, since no database is involved

**Launch**
- [ ] Find 2–3 early users (start now, in parallel with the items above); note who and their workload in the journal, without personal details
- [ ] Fix what they hit (false blocks, confusing errors, setup friction); each fix gets a test and a journal line

**Early user 1: TriStack issue-triage bot** (added 2026-10-19 with Abdullah)

TriStack (`github.com/AbdullahMukadam/tristack`, local `C:\Users\Abdullah\Desktop\tristack`) is Abdullah's open-source CLI that scaffolds Python, Go and Rust backends; it launches publicly on 2026-10-20. The bot triages its new issues, guarded by Intentlock: real public issues are the prompt-injection surface, so this is dogfooding, not a staged demo. The TriStack launch never waits on the bot.

- **Where:** a branch `triage-bot` in the TriStack repo (never `main` until it works). The bot is a standalone Node 22 package in `.github/triage-bot/` (own `package.json`, outside TriStack's Bun workspaces, so the CLI build is untouched) plus `.github/workflows/triage.yaml`. It depends on the published `@intentlock/guard`, `@intentlock/sdk` 0.2.0 and `zod`; follow `/docs/protect-your-agent/`. Intentlock code is never copied into TriStack.
- **Trigger:** `issues: opened` and `workflow_dispatch` with an issue number (for testing). Task given to the guard: "Triage issue #N in AbdullahMukadam/tristack". The plan is made from this task before the issue body is read.
- **Tools** (adapted from `apps/demo/src/agents/github/tools.ts`, Octokit with the workflow's `GITHUB_TOKEN`, permissions `issues: write`, `contents: read`): `github_get_issue`, `github_list_labels`, `github_search_issues` (similar issues), `github_add_label`, `github_post_comment`. No close, edit, PR or file tools exist at all.
- **What it does:** labels language and framework (`python`, `go`, `rust`, `fastapi`, `axum`, ...) and type (`bug`, `enhancement`, `question`, `needs-repro`); comments asking for missing details (`tristack --version`, OS, the exact command and chosen options) and links likely duplicates.
- **Policy** (agent `tristack-triage`, published in the deployed inbox): `default: block`; block any `github_*` call whose `repo` is not `AbdullahMukadam/tristack`; `github_add_label` only with `label` `in` the fixed label list; hold every `github_post_comment` for `admin`/`approver` (`timeoutSeconds` 1800) for at least the first week; allow the rest in plan. Validate with `intentlock policy validate` and dry-run sample calls (including an injected off-repo read and an unknown label) before publishing.
- **Identity:** the plan's `user` is a dedicated team member (for example a `triage-bot` member account), not Abdullah, so Abdullah can approve its holds without `self: true`.
- **Model:** `LLM_PROVIDER=openai-compatible`, `gemini-3.5-flash-lite` on Gemini's free tier (ADR on model choice). Backups only if it rate-limits: GitHub Models (free in Actions, `models: read`) or Groq, both untested with the guard.
- **Secrets** (TriStack repo secrets, never in the workflow file): `INTENTLOCK_URL`, `INTENTLOCK_API_KEY`, `LLM_API_KEY`. If the Intentlock server is asleep or unreachable the gate fails closed and the bot does nothing; the job must still exit cleanly.
- **Tests:** `FakeProvider` runs in the bot package: a normal bug report gets labels and a held comment; an issue body telling the bot to read another repo or close issues gets blocked calls and no side effects; the server unreachable means no GitHub writes.

- [x] Bot package, tools, workflow and tests on the `triage-bot` branch in TriStack (TriStack commit `8461b43d`; plain `fetch` instead of Octokit, workflow is `workflow_dispatch` only until merge)
- [x] Agent, member user, API key and policy in the deployed Intentlock; policy validated and dry-run (validated offline with the CLI; published and tested in the inbox policy editor)
- [x] Live run via `workflow_dispatch` on a test issue: labels applied, comment held and approved in the inbox, an injected issue blocked, all visible in the audit log (#19–#21 on 0.2.1: labels and approved comments live; two injected issues caused no side effects but no live block, the model ignored the injection both times; blocked injected calls are covered by the bot's FakeProvider tests)
- [ ] Merge to TriStack `main` and turn on `issues: opened`; journal what it blocked and held in the first week (real numbers only)
- [ ] Copy the bot (tools, policy, workflow) into a public example for other maintainers once it has run for a week

**Early user 1 feedback** (added 2026-10-20 with Abdullah, from the first triage-bot runs and using the deployed inbox)

- [x] **Hold notifications.** Today a hold only appears live in an open inbox; nobody is told, so a held comment can expire unseen. On hold creation, email every user who may approve it (the rule's `approvers`: roles, emails, `self`) with agent, person, tool, arguments (truncated) and a link to the hold; uses the existing SMTP mail service, skipped when SMTP is not set. Optional outgoing webhook per organization (`HOLD_WEBHOOK_URL`, Slack/Discord-compatible JSON) for teams without SMTP. Sent after the hold is committed; a failed send is logged and audited, never fails or delays the hold (fail closed stays about the tool, not the notification). No in-memory queue (stateless server). ADR first (email vs webhook, per-user opt-out, what arguments are safe to include). Tests: approvers resolved per rule, no mail without SMTP, send failure does not change the hold
- [x] **Button loaders, second pass.** Loading states were added on 2026-10-18 but never checked in a browser; Abdullah still sees buttons without one in the deployed inbox. Confirm the deployed inbox is at 0.2.1, list every button that runs an action and has no busy state, fix them with the `@intentlock/ui` `Button` `loading` prop
- [x] **Member labels.** Admins can set a short display label on a team member (for example `bot`), shown next to the person in Team, Activity, holds and run details. Separate from groups, which policies match on, so a label never changes a decision. Needs a `User` column (migration), an admin-only audited route in `API_ENDPOINTS`, zod validation (length, charset) and an ADR
- [x] **Activity pagination.** Page by page (page numbers, previous/next, page size) instead of "Load more", filters kept in the URL so a page can be shared and survives a reload; server returns a total count or keyset pages, decided in the ADR (offset paging on a growing audit table is slow)
- [x] **Audit page empty after navigating back.** Leaving the Audit page and coming back shows the empty state instead of the data. Reproduce, find the cause (likely the client cache added in 0.2.0), fix, and add a test that returning to the page shows the cached or refetched data

**Early user 1 feedback, round 2** (added 2026-10-20 with Abdullah, after clicking through a local inbox filled with about 900 runs)

- [x] **Delete an agent.** Today `DELETE /v1/agents/:id` only disables the agent, and the inbox has no way to remove one. An unused agent still counts against `maxAgents` (3 on Community). A real delete can't drop rows: audit entries keep their `agentId` (hash chain), and policy versions are never deleted. Proposal for the ADR: "delete" archives the agent. Its API keys are revoked, it disappears from lists and filters, it stops counting against the license, and its name can be reused. Activity and runs still show its history under the old name, marked deleted. Admin only, audited, confirmed in a dialog that asks for the agent's name. Tests: archived agent can't sign plans or check calls, frees the license slot, its history stays visible, chain still verifies. **Status:** ADR-075, migration, server and inbox history done (`agent-delete.e2e.test.ts`); the Delete button with a type-the-name `AlertDialog` is on the agent page (admin only)
- [x] **Charts.** Move the Overview charts (`kpi-panel`, `verdict-chart`) to shadcn charts (the `chart` component: `ChartContainer`, tooltip, legend, theme colours in light and dark) or Evil Charts (a collection of shadcn-style charts installed from its own registry). Both are built on Recharts, which is already a dependency. ADR first: which one, and whether anything new is installed. Evil Charts' license has to be checked first, and some of its charts use Apache ECharts, which would be a new dependency. The chosen chart component goes in `@intentlock/ui`. Add charts only where they answer a question (decisions over time by verdict, top blocked tools, hold outcomes, time to approve). **Done:** ADR-077, shadcn `chart` in `@intentlock/ui` (no new package), stacked verdict bars, hold outcomes (new `holdOutcomes` on the stats overview), sparklines on `ChartContainer`
- [x] **Audit page: make it useful or fold it in.** Today it is one "Verify now" button. Its job is to prove that no audit entry was edited or deleted, which is the product's tamper-evidence promise, but it shows almost nothing. Decide with Abdullah between (a) a real page and (b) a "Verify chain" panel inside Activity, with the Audit nav item removed. A real page would show chain size and head (latest seq and hash), the oldest entry kept and the retention window, when the chain was last verified and by whom, flagged client entries with links to their runs, export, and the exact `intentlock audit verify` command to check an export offline. **Done:** a real page (Abdullah's call), ADR-078: `GET /v1/audit/summary`, each verify appends `audit_verified`, flagged entries carry `planId` and link to their run (`check.e2e.test.ts`, `hybrid.e2e.test.ts`)
- [x] **shadcn components instead of browser pop-ups and hand-made parts.** Add the shadcn `Dialog` and `AlertDialog` to `@intentlock/ui`, on `@base-ui/react` like the existing components (no new dependency expected; ask if one is needed). Replace `window.prompt` (policy rollback message), `window.confirm` (revoke API key) and the hand-made mobile menu (`Sheet`). Confirm destructive actions in an `AlertDialog`: disable member, revoke invite, revoke key, reject hold, delete agent. Review where `Select`, `Popover` or `Tabs` would replace hand-made controls (`NativeSelect`, agent tabs) and keep a list of what changed. Tests: no `window.prompt`/`window.confirm` left in the inbox (source test, like the button loader test). **Done:** `alert-dialog` and `sheet` in `@intentlock/ui` on `@base-ui/react` (no new dependency); a plain `Dialog` was not added because nothing needs one (the rollback message sits in the confirm); see the journal for the Select/Popover/Tabs review
- [x] **Holds: search, filters and bulk approve/reject.** Search across tool, agent, person, rule and argument text, with filters for agent and state kept in the URL. Checkboxes per hold, "select all on this page", then Approve or Reject with an optional note. Each hold is still resolved on its own: same approver check (separation of duties), its own audit entry, its own `WHERE status = 'PENDING'` guard. The result says how many were approved and how many were skipped (expired, already resolved, not an approver). Bulk reject is confirmed in a dialog. ADR first: a bulk route (`POST /v1/holds/resolve` with up to 100 ids, per-id results; new entry in `API_ENDPOINTS`, so ask) or the inbox calling the existing approve/reject route once per hold. Tests: a mixed batch (pending, expired, not allowed) gives per-hold results and one audit entry per resolved hold. **Done:** ADR-076, bulk route `POST /v1/holds/resolve`, client-side search and filters over the loaded list (`holds-bulk.e2e.test.ts`, `hold-filters.test.ts`)

**Early user 1 feedback, round 3** (added 2026-10-22 with Abdullah)

- [x] **Tables on phones.** The stacked card layout made each Activity row about 10 lines tall. Tables now stay tables on phones (header shown, one line per row) and scroll sideways inside their panel, like the shadcn tasks table. The card-only classes were removed from `@intentlock/ui` `Table`
- [x] **Email templates.** Invite and password-reset emails were plain text only; the hold email had its own HTML. One shared layout (`mail/utils/email-layout.util.ts`: wordmark, accent bar per email type, details table, code block, button plus a pasteable fallback link, preheader, footer) now renders all three, with every value HTML-escaped (unit test). The plain-text part stays for clients without HTML
- [x] **Pausable holds (ADR-080, accepted 2026-10-23).** Today the agent process waits for the whole hold and loses the run if it dies. Build: hold-resolved events written with the status change and delivered by a Postgres `SKIP LOCKED` worker as signed webhooks with retries; file and S3-compatible checkpoint stores with optional AES-GCM; resume checks the hold's exact call before running it. TriStack: Supabase Storage bucket and a `repository_dispatch` resume job. Tests: approve, reject and expire while paused; tampered checkpoint (different call) refused; webhook retried after a failure and delivered once; process restart between pause and resume **Done (Intentlock side):** `HoldEvent` outbox written in the resolve/expire/agent-delete transactions, `HoldWebhooks` delivery (SKIP LOCKED claim with a 60 s lease, 8 attempts over ~4 h, every attempt audited), `PUT/DELETE /v1/agents/:id/webhook` + inbox Hold webhook panel, wait route returns the held call, `onHold: suspend` + `guard.resume()`, `FileCheckpointStore`/`S3CheckpointStore` (hand-written SigV4, AES-256-GCM), hybrid gate state carried in the checkpoint (`hold-webhooks.e2e.test.ts`, `hybrid.e2e.test.ts`, guard `resume.test.ts`, `stores.test.ts`)
- [x] **Pausable holds in TriStack** (split from the task above, after the next npm release, ADR-080 build notes). Supabase Storage private bucket with `S3CheckpointStore` + `encryptionKey` from a repo secret; the bot runs with `onHold: suspend` and saves the checkpoint; a relay (Supabase Edge Function) verifies the webhook signature and calls GitHub `repository_dispatch`; a short resume job loads the checkpoint, calls `guard.resume()` and deletes it; bucket lifecycle rule for runs never resumed. Docs: add it as a recipe on the "Pause on a hold" page, not as product code **Status (2026-10-24):** code done on TriStack branch `feat/triage-pausable-holds` (`dd45be35`): bot pauses when all six checkpoint settings are set (else waits as before), `resumeTriage`, `repository_dispatch` resume with a per-plan concurrency group, `intentlock-relay` Supabase Edge Function (`handler.ts` tested with the real `signWebhook`/`verifyWebhook`), setup README; 17 bot tests green. Waiting on Abdullah: Supabase bucket + S3 keys, dispatch token, webhook URL in the inbox, relay deploy, repo secrets, merge, then one live run **Live (2026-10-24):** TriStack PR #35 merged; issue #36: triage run labeled it and paused on the held comment (run 40104187780), approved in the inbox, resume run 40104383092 posted the comment. Resume logged a harmless `plan_not_active` on its token refresh (the plan's only required step had run), see backlog
- [x] **Hold outcomes on phones.** The Overview hold-outcomes panel (`overview/hold-outcomes.tsx`) does not fit a phone screen. Make it readable at 375 px (chart, legend and numbers stack or wrap; no clipped labels, no page-wide horizontal scroll); check light and dark **Done:** the legend stacks one row per outcome below `sm` (three columns from `sm` up), swatches no longer shrink to nothing, numbers stay on one line; checked with headless Edge at 375 px and 1280 px, light and dark (no clipped or overflowing elements)
- [x] **Policy page on phones.** The agent's policy tab (`policy/policy-panel.tsx`, `policy-editor.tsx`, `test-panel.tsx`, `diff-view.tsx`, `version-history.tsx`) is hard to use on a phone. Editor full width with a usable height, action buttons wrap, the test results and version history readable, the diff usable (stacked instead of side by side if needed); editing YAML on a phone only has to work, not be pleasant **Done:** the editor's long YAML lines set the cards' minimum width, so at 375 px the editor, the Publish button and the history buttons were off screen; the policy card grids are now `minmax(0,1fr)` (the editor scrolls sideways inside itself), and `DiffView` shows a unified, stacked diff below 640 px (side by side from `sm` up). Checked with headless Edge at 375 and 1280 px, light and dark, editor, test results, version diff and "Show changes"
- [x] **API keys tab on phones.** `agents/api-keys-table.tsx` and the create-key form on the agent page: the table scrolls inside its panel like the other tables, the create form and the one-time key reveal fit the screen, the key can be copied **Done:** the create form fills the panel width on phones (the Create key button stuck out past the panel), and the shared `SecretReveal` shows the secret full width with Copy/Done below it under `sm` (it was a 149 px column); the table already scrolled inside its panel. Copy checked in headless Edge: the clipboard holds exactly the shown key and the button turns to Copied; 375 and 1280 px, light and dark
- [x] **Visual policy builder.** Build and edit rules with forms instead of YAML: pick tools, add argument conditions (`eq`, `in`, `glob`, `lte`, ...), user/role/group match, decision, approvers and timeout for holds, drag to reorder (first match wins). It writes the same YAML (round-trip with the editor, no second format), validates with core `parsePolicy` as you go, and publishes through the existing publish route (409 on a stale base). ADR first: free or paid (it is listed as a paid candidate in Phase 7), which rule shapes the form covers and how YAML it cannot show is handled (fall back to the editor). Tests: form → YAML → form round-trip for every rule type **Done:** ADR-081 (free; rewrite-and-warn for comments and anchors; drag plus up/down). Form/YAML switch on the policy tab, `PolicyForm` + `RuleCard` + `MatchFields`, core `policyToYaml`/`yamlExtras` (`to-yaml.test.ts`: every rule shape round-trips), inbox `policy-form.ts` (`policy-form.test.ts`: form → YAML → form for every rule type and condition, which values the form can keep). Checked with headless Edge at 375 and 1280 px, light and dark: add rule, hold approvers, argument condition, move up, YAML updated, no console errors

**After launch (v0.2, decide with early-user feedback)**
- The MCP proxy (Phase 7) is the next headline feature; a Python SDK is not planned
- Plan extension mid-run and non-blocking holds (webhook/callback approvals) only when a user needs them; plan extension needs an ADR first because it touches "never widen a signed plan"

**Acceptance:** the self-host bundle uses pinned tags; someone outside the project follows the guide and gets a hold and a block on their own agent; key rotation test green; `pnpm test && pnpm lint && pnpm typecheck` green.

---

## Phase 7.1 · MCP proxy — `packages/mcp-proxy`

Added on 2026-10-19 with Abdullah, as the first item after the Phase 6.7 build work: put Intentlock in front of any stdio MCP server, so Claude Desktop, Cursor or Claude Code are guarded without code changes. Design in ADR-070 (plan file, return-and-retry holds).

- [x] ADR-070; package scaffold (`@intentlock/mcp-proxy`, ELv2, bin `intentlock-mcp`, tsup, eslint boundaries); `@modelcontextprotocol/sdk` installed offline from the local store
- [x] Plan file (zod-validated, core plan steps) and CLI arguments (`--plan`, `--user`, `--list-tools`, `-- <upstream command>`), env `INTENTLOCK_URL`, `INTENTLOCK_API_KEY`, `INTENTLOCK_USER`, `INTENTLOCK_OUTBOX_DIR`
- [x] Proxy: `tools/list` shows only planned upstream tools; `tools/call` goes through the gate; allowed calls forwarded and reported; blocked calls return an error result with the reason; token refresh, then re-sign the plan file when refresh fails; fail closed on gate errors
- [x] Holds return and retry: the held call returns at once; a repeat of the same call (canonical tool + args) runs on approval, blocks on rejection, repeats the message while pending, re-checks after expiry
- [x] Tests with in-memory MCP transports and a fake upstream server: listing, allow, block (not in plan, policy), hold pending → approved → runs once, rejected, different args never match an approval, refresh and re-sign, gate failure blocks, upstream error reported
- [x] Docs page "MCP proxy" in the site (Claude Desktop / Cursor / Claude Code config, plan file, `--list-tools`, holds, limits); README and STRUCTURE updated

**Acceptance:** the proxy in front of a local test MCP server allows planned calls, blocks off-plan and off-policy calls, and runs a held call only after approval; `pnpm test && pnpm lint && pnpm typecheck` green. Trying it against the real GitHub MCP server needs a download, so ask Abdullah first.

---

## Phase 8 · Sellable: one paid license — `apps/server`, `apps/inbox`, `apps/site`, `scripts`, `docs`

Added on 2026-10-25 with Abdullah. Intentlock is sold as one paid, self-hosted license, priced per seat per year. Without a license it runs in a free limited mode (5 users, 3 agents, 30-day retention). Every feature is in both modes. All code stays in this repo under ELv2 (ADR-082). Today's license only enforces the user and agent limits, so this phase makes the rest real and adds what a buyer checks before paying.

**Decide and document first**
- [x] ADR-082: single paid tier, free limited mode, per seat per year, all code in this repo, license problems never weaken security
- [x] PRD §11 rewritten for ADR-082
- [x] ARCHITECTURE §5.7 rewritten in the same change as the license format below
- [x] Open questions answered (ADR-082 amendment): 14-day grace period at full limits with no banner, 365 days default retention on a paid license, a seat is an active user

**License format** (no license sold yet, so no compatibility path)
- [x] Remove `features`, `LicenseFeature` and `hasFeature()`; `LicenseEdition` becomes `FREE = "free"`, `LICENSED = "licensed"`; `COMMUNITY_LICENSE` becomes `FREE_LICENSE`; inbox schema, footer and CLI follow
- [x] `scripts/issue-license.ts`: `--seats <n>` (sets `maxUsers`), agents unlimited, `--retention-days` default 365; refuses a missing or past expiry
- [x] Tests: free / valid / expired / bad signature / wrong key; over the free limit after expiry keeps existing users and agents working and refuses only new ones; an expired license changes no decision (existing test kept)

**License in the inbox** (new routes in `API_ENDPOINTS` first, admin-only, audited)
- [x] License stored in the database (`License` table with `orgId`; newest valid row wins), so every instance sees the same license without a shared file. `LICENSE_FILE` still works and takes precedence when set. `LicenseService` re-reads on its 24 h timer and right after an upload, with no in-memory state that another instance depends on
- [x] Admin **License page**: mode, licensee, seats used / total, agents, retention, expiry date; paste or upload a license key (verified on the server before it is stored; a bad key returns its reason); remove a license
- [x] Limit errors in the inbox: inviting a user or creating an agent over the limit says which limit, the current count and "apply a license", with a link to the License page (admins) or "ask an admin" (others)

**Expiry**
- [x] Banner for admins 30, 7 and 1 days before expiry (none during the grace period); email to admins at the same points through `MailService` (skipped without SMTP), sent once per point (recorded, safe across instances)
- [x] After expiry: 14 days at full limits (grace, no banner), then free limits. Audit entries `license_applied`, `license_removed`, `license_expired`

**Audit retention and deletion** (ADR-083, replaces the Phase 7 purge item)
- [x] ADR-083: license retention is a visibility window; deletion is opt-in in env, archived to S3-compatible storage or a folder first, anchored in the chain
- [ ] Visibility window: Activity, audit pages and export, runs and stats only reach `retentionDays` back; server verify still walks every entry; License and Audit pages say "history shown"; tests (a 40-day-old entry is hidden on free and shown with a license, verify still counts it)
- [ ] core: `verifyChain(entries, { from })`; Signature V4 on WebCrypto in core, used by guard's `S3CheckpointStore` (its tests unchanged) and the server; CLI `audit verify` checks a windowed export from its first entry and `--archive <file>...` plus the export end to end
- [ ] Deletion job: `AUDIT_DELETE_AFTER_DAYS` (min 90), `AUDIT_ARCHIVE_DIR` or `AUDIT_ARCHIVE_S3_*` (refuse to boot with deletion on and no target); daily under an advisory lock, batches of 10 000, write, read back and compare SHA-256, then `audit_purged` plus delete in one transaction under the chain lock; failures delete nothing, `audit_purge_failed`, one admin email per day
- [ ] Verify across deletion: server verify and the Audit page start at the first kept entry and check it against its `audit_purged` anchor; tests: purge keeps verify green; rows deleted without an archive fail verify; a failed or mismatched archive deletes nothing; two instances never purge the same batch; an edited archive file fails the CLI check
- [ ] Docs: environment variables, self-host (archive volume or bucket), licensing page ("history shown"), Audit page text

**Selling** (mostly outside the code)
- [ ] README and the site's licensing page: free limits, what a license unlocks, and "using Intentlock beyond the free limits requires a license; removing or bypassing the license check is not permitted"; every file outside the MIT packages covered by the root ELv2 `LICENSE`
- [ ] Pricing page on the site (price per seat per year, what is included, how to buy, how to apply the key); no checkout code in this repo
- [ ] **Manual, Abdullah:** lawyer review of ELv2 and the commercial terms (EULA / order form), CLA for outside contributions to ELv2 parts
- [ ] **Manual, Abdullah:** payment through a merchant of record (for example Lemon Squeezy or Paddle, which handle sales tax), and a small private service that issues the license JWS on purchase and emails it. The vendor private key lives only there, never in this repo
- [ ] Support channel and response time written on the pricing page

**Acceptance:** a fresh install runs in free mode and refuses a 6th user and a 4th agent with a clear message; an admin pastes a license in the inbox and the limits lift on every instance without a restart; a license close to expiry shows the banner and emails admins, and after expiry falls back to free limits once the 14-day grace period ends, without blocking any agent call; with deletion on, old entries are archived and deleted and the chain still verifies from the archive and the database, and with it off nothing is ever deleted; `pnpm test && pnpm lint && pnpm typecheck` green.

---

## Phase 8.1 · Production basics (in the paid license, no gating) — `apps/server`, `apps/inbox`, `deploy`

What a buyer's security or ops review asks for. Order can change with early-buyer feedback.

- [ ] Two-factor sign-in (TOTP) for every user, required for admins and approvers by an org setting; recovery codes; ADR first (new dependency or `node:crypto` HMAC, ask)
- [ ] Backup and restore: documented `pg_dump` and signing-key backup, a restore that is tested, and a chain verify after restore
- [ ] Cross-instance live events with Postgres `LISTEN/NOTIFY` (moved from Phase 7, DEPLOYMENT §6.1), so more than one server instance needs no sticky sessions
- [ ] Prometheus `/metrics` (checks, holds, audit lag, webhook failures) and OpenTelemetry spans (moved from Phase 7); ask before adding dependencies
- [ ] Signed images, SBOM and a CVE scan in CI

**Later, decide with buyers:** approve holds from Slack or Teams, generic OIDC/SAML sign-in and SCIM, audit streaming to a SIEM, per-tool argument redaction, second-admin approval for policy changes, a Helm chart, an offline install bundle.

---

## Phase 7 · Stretch (only after Phase 6)

- `packages/mcp-proxy`: moved to Phase 7.1
- ~~Inbox team page (list, add, disable, re-issue token) for admins~~ moved to Phase 5.5
- [x] Visual policy rule builder → built free in Phase 6.7 round 3 (ADR-081)
- [ ] Second-admin approval for policy changes (in the single license, ADR-082; see Phase 8.1 "Later")
- [ ] Per-tool argument redaction in the dashboard (in the single license, ADR-082; see Phase 8.1 "Later")
- ~~Audit retention purge per license `retentionDays`~~ moved to Phase 8
- ~~Docs site (Next.js / Fumadocs) in the monorepo~~ moved to Phase 6.6 (`apps/site`, Astro + Starlight)
- [ ] Taint tracking: mark data from private sources and hold writes that contain it
- ~~OpenTelemetry spans for checks~~ moved to Phase 8.1
- ~~Cross-instance live events via Postgres `LISTEN/NOTIFY`~~ moved to Phase 8.1
- [ ] Sharded audit chains with a Merkle-root global anchor (DEPLOYMENT §6.2)

---

## Backlog

- [x] **Resume refreshes only when needed:** `guard.resume()` always refreshes the token; the server refuses refresh for a completed plan (409 `plan_not_active`, seen on TriStack #36 after the only required step had run) and the guard emits an error event although nothing failed. Refresh only when the token is expired or close to it; later checks already refresh once on `token_expired`. Patch release **Done:** `tokenNeedsRefresh` (expired or within 60 s, unreadable token counts as needing it); 0.3.1
- [ ] **Long holds with pausing:** the server refreshes a plan token at most 60 min after it expired (tokens last 15 min), so a run resumed more than ~75 min after it paused settles the held call but blocks later calls with `token_expired`. Options for an ADR: allow refresh of a paused plan with an approved or rejected hold up to the hold's own timeout, or let resume sign a fresh token for the same plan hash after checking the hold. Documented on the "Pause on a hold" page
- [ ] **Inbox form tests:** component tests for the new forms (sign-in, setup, invite accept, password reset, team invite and member actions, account password/sessions/CLI token, onboarding). Needs React Testing Library (`@testing-library/react`, plus a DOM environment such as `jsdom` or `happy-dom` for Vitest) as new dev dependencies; ask Abdullah before adding them

---

## Definition of done (every task)

- Code is typed (no unexplained `any`), validated at boundaries with zod, and formatted
- Tests cover the new behaviour, including the failure path
- `pnpm test && pnpm lint && pnpm typecheck` green
- Docs updated if behaviour or API changed; ADR if a decision was made
- Task ticked here; journal updated at session end
