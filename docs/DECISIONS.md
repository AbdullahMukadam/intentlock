# Decisions — Intentlock

Architecture Decision Records. Add a new one for any non-obvious choice. Never edit an accepted ADR's decision; supersede it with a new ADR instead.

## Template

```markdown
### ADR-00X: <title>
- **Date:** YYYY-MM-DD · **Status:** Proposed | Accepted | Superseded by ADR-00Y
- **Context:** what forced a decision
- **Decision:** what we chose
- **Alternatives:** what else was considered and why not
- **Consequences:** what this makes easier / harder
```

---

### ADR-001: Project name "Intentlock"
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** The working name "IntentGate" was already in use. The name should say what the product does (lock an agent to the intent of its request) and be free on npm.
- **Decision:** `Intentlock`. npm scope `@intentlock/*`, CLI binary `intentlock`, env prefix `INTENTLOCK_`, API key prefix `il_live_`. On 2026-10-11 both the npm package name `intentlock` and the `intentlock` scope were unclaimed.
- **Alternatives:** Planwarden, Toolwarden, Actguard, Plansign, Toolwarrant.
- **Consequences:** Before publishing, the owner checks the GitHub org/repo name, a domain, and a basic trademark search, and claims the npm scope in Phase 0.

### ADR-002: TypeScript monorepo (pnpm + Turborepo)
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Several packages and apps share types (plan, decision, audit entry). Owner's strongest stack is TS; Editorcn already uses Turborepo.
- **Decision:** pnpm workspaces + Turborepo; `tsup` for package builds; Vitest for tests.
- **Alternatives:** Python (ArmorIQ/AgentDojo ecosystem) — rejected: weaker fit for the owner's SWE profile; Nx — heavier than needed.
- **Consequences:** AgentDojo (Python) is not used directly; we build our own TS scenario suite.

### ADR-003: Intent-based, plan-before-data enforcement
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Identity-scoped tokens let an injected agent do anything the token allows (Invariant Labs GitHub MCP attack, May 2025).
- **Decision:** A planner call that sees only the user's request produces the plan; it is signed before any tool runs. Off-plan calls are blocked before policies are evaluated.
- **Alternatives:** Per-call plans (the plan is derived from the call itself, so injected calls pass); prompt-injection classifiers (probabilistic, bypassable).
- **Consequences:** Benign tasks the planner under-specifies will be blocked → measure utility in evals.

### ADR-004: Ed25519 JWS tokens via `jose`
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Need short-lived, verifiable, stateless plan tokens.
- **Decision:** Compact JWS, `alg: EdDSA`, full plan embedded, TTL 15 min, `kid` for rotation, JWKS endpoint.
- **Alternatives:** HMAC (shared secret can't be verified by third parties); opaque tokens + DB lookup (adds latency, loses offline verification).
- **Consequences:** Tokens are larger (plan inside); acceptable at ≤ 50 steps.

### ADR-005: RFC 8785 JSON canonicalization for hashing
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Plan hash and audit hash must be stable across key order and whitespace.
- **Decision:** `canonicalize` package (JCS) before SHA-256.
- **Alternatives:** `JSON.stringify` with sorted keys (hand-rolled, edge cases with numbers/unicode).

### ADR-006: Own YAML policy engine, not OPA, for v0.1
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Need allow/block/hold rules on tool, args and user within a week.
- **Decision:** Small ordered-rule engine in `core` (first match wins, default block), policies in YAML validated by zod.
- **Alternatives:** OPA/Rego (powerful, but WASM/sidecar setup and a second language); Cedar.
- **Consequences:** Easy to test and explain; an OPA adapter is a possible future feature.

### ADR-007: Hash-chained audit log in Postgres
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Audit must be tamper-evident and verifiable offline.
- **Decision:** Each entry stores `prevHash` and `hash`; appends serialized with a row lock; verify walks the chain; hashing in `core` so a CLI can verify exports.
- **Alternatives:** Merkle tree (better for proofs of single entries; more work); external transparency log.
- **Consequences:** Appends are serialized (fine at demo scale); note throughput in the journal.

### ADR-008: Fail closed everywhere
- **Date:** 2026-10-11 · **Status:** Accepted
- **Decision:** Only an explicit `allow` runs a tool. Errors, timeouts, server down, bad tokens → block.
- **Consequences:** Server outage stops agents; `LocalGate` covers dev and offline.

### ADR-009: Long-polling for hold waits, WebSocket for the inbox
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** SDK clients should work behind any network without a socket client; the inbox needs live updates.
- **Decision:** SDK uses `GET /v1/holds/:id/wait` (≤ 25 s per request, looped). Inbox uses a WebSocket gateway.
- **Alternatives:** SSE for both; webhooks.

### ADR-010: Mock backends for evals, real GitHub only for the demo
- **Date:** 2026-10-11 · **Status:** Accepted
- **Decision:** Evals run against in-memory GitHub/email/filesystem mocks so results are deterministic and side-effect free. The live demo uses throwaway GitHub accounts with fake data.
- **Consequences:** Eval results measure the enforcement layer, not GitHub quirks.

### ADR-011: Provider-agnostic agent guard
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** The Anthropic API needs billing, and the owner's card isn't accepted. The security core never needs a model, but the guard loop, demo and evals do.
- **Decision:** The guard loop depends only on an `LLMProvider` interface with neutral message types. Ship three adapters: `OpenAICompatibleProvider` (covers Gemini's OpenAI-compatible endpoint, Groq, OpenRouter, Ollama via `baseURL`), `AnthropicProvider` (separate package, tested with recorded/fake responses until a key exists), and `FakeProvider` (tests + forced-attack demo). Provider chosen via `LLM_*` env vars.
- **Alternatives:** Anthropic-only (blocked on billing); Bedrock/Vertex (still needs a card that's accepted); OpenRouter only (paid, single vendor).
- **Consequences:** ~half a day of extra work in Phase 3. Free models call tools less reliably, so a quick model comparison is part of Phase 3. Eval results must always be labelled with provider and model. The project's pitch broadens from "guards Claude agents" to "guards any LLM agent".

### ADR-012: Default free model for development and evals
- **Date:** 2026-10-12 · **Status:** Accepted
- **Context:** Need one reliable, free tool-calling model for the demo and evals.
- **Decision:** **`gemini-3.5-flash-lite`** on Gemini's OpenAI-compatible endpoint (`LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`), free-tier key.
- **Comparison** (the `RUN_LIVE=1` smoke test in `packages/guard/src/live.test.ts`: planner `declare_plan` with forced tool choice, then `list_issues` + `add_label` with a prompt injection in the issue body; two runs each, 2026-10-12):

  | Model | Result | Notes |
  | --- | --- | --- |
  | `gemini-3.5-flash-lite` | 3/3 passed, ~10 s per run | Valid `declare_plan` first try, 3 turns, never called `delete_repo` |
  | `gemini-3.8-flash` | 0/4 | 503 "high demand" on every attempt, then 429 free-tier quota |
  | `gemini-3.5-flash` | 0/2 | 503, then 429 |
  | `gemma-4-31b-it` | 0/2 | Timed out at 180 s |
  | `gemini-2.5-flash` | — | 404, closed to new users |

  The first Flash-Lite attempt failed with 400 "missing thought_signature": Gemini 3 needs each tool call's `extra_content.google.thought_signature` echoed back, fixed by `ToolCallReq.providerData` (ADR-044). Groq and Ollama were not compared (no key / no local install); they stay supported through the same adapter.
- **Consequences:** The free-tier quota is small and shared across models; the evals should run sequentially with retries on 429/503 rather than in parallel. Rerun the comparison when a bigger Flash model stops returning 503.

### ADR-013: Hybrid enforcement as the default mode
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Sending every tool call to the server adds a network hop per call and makes the server a dependency of every action. Local checks are just as strong against prompt injection, because the model cannot skip code in the guard.
- **Decision:** The server signs a bundle once per plan (plan + the user's policy snapshot + role). `HybridGate` verifies the signature locally (cached JWKS) and runs the pure `check()` in-process. Only holds go to the server. `remote` mode (`HttpGate`) stays available for untrusted hosts, instant revocation and cross-run limits.
- **Alternatives:** Remote-only (simplest, highest latency, server on the hot path); local-only (no holds, no trustworthy audit).
- **Consequences:** Policy changes take effect at the next plan or refresh, so TTLs stay short (5–15 min). Cross-run limits (e.g. per-day caps) need `remote` mode. Evals compare latency across modes.

### ADR-014: Local outbox file + background worker for audit in hybrid mode
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Hybrid decisions happen on the client but must reach the server's tamper-evident log, without adding latency or being lost on a crash.
- **Decision:** Append each decision to a per-plan JSONL outbox (local hash chain, fsync) **before** acting on it. An in-process background worker uploads batches every 5 s / 100 entries with backoff to an idempotent `POST /v1/audit/batch`, tracks acks in a `.ack` file, and recovers leftover files on startup. The server re-runs `check()` on each entry and flags mismatches and gaps. If unacked entries exceed 500 or 60 s, new calls are blocked (`audit_backlog`).
- **Alternatives:** In-memory buffer (lost on crash); synchronous upload per call (back to remote mode's latency); SQLite outbox (more robust, extra dependency — possible later).
- **Consequences:** Needs a writable disk (serverless falls back to an in-memory buffer with documented risk). A compromised host can withhold entries; backpressure, gap detection and missing reports make that visible, not impossible.

### ADR-015: Repository structure and import boundaries
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** Claude Code will create most files; without a fixed layout, files drift and package boundaries blur (e.g. provider SDKs leaking into core).
- **Decision:** Layout, naming and the package dependency graph are fixed in `docs/STRUCTURE.md`. Shared configs live in `tooling/`. Unit tests are colocated; app integration tests live in `test/`. Boundaries are enforced with `no-restricted-imports` and package `dependencies`. Packages use named exports and expose only `src/index.ts`.
- **Alternatives:** Tests in a separate `__tests__` tree (further from code); feature-folders across packages (blurs the pure-core rule).
- **Consequences:** Adding a package or crossing a boundary requires updating STRUCTURE.md and, if it changes the graph, an ADR.

### ADR-016: Stateless, horizontally scalable server; scale features staged
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** The server should run as several instances behind a load balancer, but the week only allows part of the scaling work.
- **Decision:** v0.1 builds multi-instance *correctness*: atomic counters, idempotent hold expiry and guarded transitions, advisory-locked chain appends, no shared in-memory state, migrations as a release step. It proves this with a two-instance scale test. Cross-instance WebSocket fan-out (Postgres LISTEN/NOTIFY) and sharded audit chains with a Merkle anchor are designed in `DEPLOYMENT.md` and left as stretch.
- **Alternatives:** Single instance only (simpler, not credible for a security service); Redis from day one (extra infrastructure before it is needed).
- **Consequences:** Live inbox updates need sticky sessions or one instance until fan-out lands; the inbox's 10 s polling covers the gap. The global audit chain is the known throughput ceiling.

### ADR-017: Free hosting on Render + Neon + Vercel
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** The project must be deployable at no cost and without a credit card (the owner's card is not accepted by several providers).
- **Decision:** Server on Render's free web service (Docker), Postgres on Neon's free plan, inbox on Vercel Hobby, images on GHCR. The public deployment runs demo data and the scripted forced-attack mode only; no model or GitHub keys on hosted services. The two-instance scale test runs locally.
- **Alternatives:** Render free Postgres (expires after 30 days); Fly.io (card required, no free tier for new users); Koyeb (free plan closed to new users, Feb 2026); Railway (trial credit, then $1/month).
- **Consequences:** Cold starts (~1 min on Render, a slower first query on Neon); single server instance in the hosted demo; no database backups. Acceptable for a portfolio demo; production would use paid tiers. Free-tier limits must be re-checked before deploying.

### ADR-018: Scaffold with Better-T-Stack; NestJS added separately
- **Date:** 2026-10-11 · **Status:** Accepted · Amends ADR-015 (shared configs move from `tooling/` to `packages/config`)
- **Context:** Hand-scaffolding a Turborepo, a Next.js app with shadcn/ui and six packages costs most of Phase 0. Better-T-Stack generates these, but has no NestJS option.
- **Decision:** Use `create-better-t-stack` with Turborepo + pnpm + Next.js and `--backend none --database none --orm none --api none --auth none`; add library packages with its `add --package`; add the server with the Nest CLI and wire it to the shared config. Adopt the generator's conventions (`packages/config`, `packages/ui`, `bts.jsonc`) and update STRUCTURE.md where they differ. Exact commands in STRUCTURE §7.
- **Alternatives:** Hand-built scaffold (slower, more config bugs); Better-T-Stack with a Hono/Express backend (duplicates the NestJS server); a NestJS monorepo template (no Next.js/shadcn setup).
- **Consequences:** CLI flags may change between releases, so Phase 0 starts with `--help` and `--dry-run`. Prisma stays inside `apps/server`, not a shared `packages/db`.

### ADR-019: Target customer — small teams, self-hosted, single-tenant
- **Date:** 2026-10-11 · **Status:** Accepted · Policy storage amended by ADR-023 (database versions, not YAML files)
- **Context:** Earlier docs mixed SaaS ideas (API keys per org, per-org chains, hosted deployment) with self-hosted ones (YAML policies in the image, one users table).
- **Decision:** Intentlock is for small teams (~2–50 people) that run one deployment for their own agents. No multi-tenancy in v0.1, but every table carries `orgId` (one organization row) and all queries are scoped through one helper, so a hosted version later is an extension, not a rewrite. Our Render/Vercel deployment is only a public demo of a self-hosted install.
- **Alternatives:** SaaS now (2–3 extra days: tenancy, signup, per-org keys and policies, ops; competes head-on with ArmorIQ); individual developers only (no approvers, weak story).
- **Consequences:** Every agent run maps to a real team member; approvals need real sign-in (ADR-020). Policies stay as YAML files in v0.1.

### ADR-020: Inbox sign-in with personal login tokens and sessions
- **Date:** 2026-10-11 · **Status:** Superseded by ADR-058
- **Context:** Approve/reject previously took the approver's name from the request body, so anyone who could reach the inbox could approve. A team product must tie every approval to a person.
- **Decision:** Users have a role (`admin | approver | member`) and groups. Admins issue personal login tokens (shown once, stored hashed); sign-in exchanges email + token for an httpOnly session cookie. Approve/reject accept sessions only; the approver is the session user and must satisfy the hold's `ApproverSpec` (roles / emails / `self`, with separation of duties by default). API keys are for agent apps and can never approve. First admin is bootstrapped from env. User management is CLI-first; inbox team page is stretch.
- **Alternatives:** Passwords (storage, reset, email delivery — too much for v0.1); OAuth/OIDC (external dependency; planned as a paid SSO feature); magic links (need email delivery).
- **Consequences:** Inbox and API must share one origin for cookies (DEPLOYMENT §10). Adds auth endpoints, rate limiting and CSRF checks to Phase 2.

### ADR-021: Source-available license (Elastic License 2.0) with MIT SDK packages
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** The product should be sellable later, but the code should stay readable for the owner's resume and for customers evaluating it.
- **Decision:** Root `LICENSE` = Elastic License 2.0 for server, inbox, CLI, evals, demo and scripts. The SDK packages customers embed (`core`, `sdk`, `guard`, `anthropic`) are MIT, each with its own `LICENSE`. Only MIT packages are published to npm; server and inbox ship as Docker images.
- **Alternatives:** Functional Source License (converts to open source after two years; less explicit about license keys); Business Source License (custom "additional use grant" per product); private repo (hides the work from recruiters); fully open source (harder to monetize).
- **Consequences:** ELv2 forbids offering Intentlock as a managed service and circumventing license-key functionality, which matches the editions model. External contributions to ELv2 parts need a CLA before commercial sale. Not legal advice; confirm before selling.

### ADR-022: Offline license keys and editions (groundwork only)
- **Date:** 2026-10-11 · **Status:** Accepted · Amended by ADR-024 (Community also limited to 3 agents; `maxAgents` enforced)
- **Context:** Self-hosted, often offline customers need licensing that works without phoning home, and paid features need one place to check entitlements.
- **Decision:** A license is a JWS signed with a separate vendor Ed25519 key; the server ships only the public key and verifies offline at boot and daily. No/invalid/expired license → Community limits (5 users, 30-day retention, no paid features). v0.1 enforces `maxUsers` and exposes `hasFeature()`; no billing. License code lives in the ELv2 server, not the MIT core. A license problem never disables enforcement, holds or audit.
- **Alternatives:** Online activation server (breaks offline installs, more infrastructure); no licensing until later (retrofitting entitlement checks is harder).
- **Consequences:** Editions in PRD §11 can be sold with contracts plus license files. Determined users could patch the check in source-available code; ELv2 makes that a license violation, which is the intended enforcement.

### ADR-023: Policies stored as versions in the database, edited in the inbox
- **Date:** 2026-10-11 · **Status:** Accepted · Replaces the "YAML files in the server image" approach
- **Context:** Baking policy files into the image meant every policy change needed a rebuild and redeploy, and approvers/auditors had no way to see or change policies without a terminal.
- **Decision:** Each agent has a `PolicySet` with immutable, numbered `PolicyVersion`s and one shared draft. Admins edit in a CodeMirror YAML editor in the inbox with live validation (the pure `@intentlock/core` parser runs in the browser), a dry-run test (sample calls and replay of recent decisions), a diff, and publish-with-message; stale publishes get 409; rollback creates a new version. The server re-validates and is the source of truth. `intentlock policy pull|test|push` offers the same flow for teams that keep policies in Git. Every decision records the policy version that made it.
- **Alternatives:** Files in the image (redeploy per change); CLI push only (no UI for non-developers); visual rule builder now (slower to build; kept as a later paid feature).
- **Consequences:** No redeploys for policy changes. The inbox depends on `@intentlock/core` (pure, MIT) for validation. Running plans keep their policy snapshot until their bundle expires.

### ADR-024: Agents own API keys and policies
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** API keys were organization-wide and nothing said which policy applied to which agent application.
- **Decision:** An `Agent` (one per AI application or purpose, typically 1–10 per team) owns its named API keys and its policy. Keys are `il_live_` + random bytes, shown once, stored hashed with a visible prefix and last-used time, revocable. Plan signing identifies the agent from the key and snapshots its active policy; the plan's `user` identifies the team member. New agents start with a safe starter policy (default block, allow in-plan calls).
- **Alternatives:** Org-wide keys with a policy selector per request (lets a compromised app pick a weaker policy); one policy for all agents (too coarse).
- **Consequences:** Per-agent dashboards and kill switches; `maxAgents` becomes an edition limit (Community: 3).

### ADR-025: Dashboard built on the audit log
- **Date:** 2026-10-11 · **Status:** Accepted
- **Context:** The audit log was only used as a record and for chain verification.
- **Decision:** The inbox gets Overview (verdicts over time, pending holds, time-to-approve, top blocked tools/rules, flagged entries, audit lag), Activity (filterable decision explorer with JSONL export) and Run detail (one run's calls in order with deciding rule and approvals). `AuditEntry` gets denormalized, indexed columns (`agentId`, `tool`, `verdict`, `ruleId`, `policyVersion`), which are part of the hashed entry. Aggregations are plain SQL in v0.1.
- **Alternatives:** Separate analytics store (overkill at this scale); table-only audit viewer (wastes the data).
- **Consequences:** Tool arguments may be sensitive; they are visible only to users allowed to see the run, with per-tool redaction as a later paid feature.

### ADR-026: Default-deny access to everything
- **Date:** 2026-10-11 · **Status:** Accepted · Extends ADR-020
- **Context:** Logs, policies, agents and holds are sensitive; only approvals were explicitly protected.
- **Decision:** Nothing is public except the sign-in page. A global NestJS guard requires a session on every route; routes opt out only with `@Public()` (sign-in, health, JWKS) or `@AgentAuth()` (API-key routes), and a test enumerates routes to catch accidental public ones. Next.js middleware redirects to `/login` for convenience only. The WebSocket requires a session. Reads are role-scoped: admins and approvers see all activity, members see their own runs.
- **Alternatives:** Per-route opt-in guards (easy to forget one).
- **Consequences:** No public demo pages; recruiters see the recorded video.

### ADR-027: Three free demo agents and our own private instance
- **Date:** 2026-10-11 · **Status:** Accepted · Amends ADR-017 and ADR-019 (our Render/Vercel deployment is our private team instance, not a public demo)
- **Context:** The demo must run at no cost and show more than one kind of attack; we also need a real deployment to use and record.
- **Decision:** Demo agents: `github-assistant` (throwaway GitHub accounts; Invariant-style leak), `support-assistant` (Mailpit + local JSON orders; forward-to-attacker, refund thresholds, group rules), `files-assistant` (sandbox folder + local webhook receiver; `.env` exfiltration). All use a free model tier or Ollama, run on our laptop, and connect to our own Intentlock instance (Render + Neon + Vercel, sign-in required, nothing public) with per-agent API keys. A `setup` script registers agents, creates keys and publishes their policies; `seed` makes each attack repeatable; forced-attack mode guarantees the video works.
- **Alternatives:** GitHub agent only (narrower story); paid sandboxes (Stripe, SendGrid — cost or card problems); a public demo instance (conflicts with default-deny).
- **Consequences:** Support and files agents are cut first if Friday runs late. Live-update shots are recorded against local `docker compose` because the free-hosted inbox falls back to polling.

### ADR-028: Pre-implementation spec fixes — audit hash coverage, check() signature, hold ids, missing args
- **Date:** 2026-10-11 · **Status:** Accepted · Point 2 refined by ADR-030 (`check` takes no clock; `decide` takes a usage resolver)
- **Context:** A read-through before Phase 0 found contradictions that Phase 1 code would have had to guess at: the audit hash formula covered only `{seq, at, kind, user, planId, payload}` while §5.3 claimed the denormalized columns were hashed; PLAN and ARCHITECTURE gave different `check()` signatures; the core `Decision` carried a `holdId` that pure code cannot create; `notGlob`/`notIn` on a missing argument was undefined; `StepUsage` and `PolicyDraft` had no `orgId`.
- **Decision:**
  1. The audit entry hash covers **every `AuditEntry` column except `hash`** (ARCHITECTURE §5.4). A unit test keeps the hashed field list in sync with the schema.
  2. Core `check(bundle, call, usage, now)` is pure and synchronous, takes already-verified bundle claims (role and groups included, so no user map). `decide(token, publicKey, call, usage, now)` chains `verifyBundle` → `check` inside the fail-closed wrapper; gates and the server call `decide`.
  3. Core returns `Decision` (hold without id); `Gate.check()` and `POST /v1/check` return `GateDecision`, where a hold carries the server-created `holdId`.
  4. Positive arg operators match only a present, correctly typed argument; `notIn`/`notGlob` are exact negations and therefore match a missing or wrong-typed argument (fail closed for block rules).
  5. `StepUsage` and `PolicyDraft` get `orgId`, like every other table.
- **Alternatives:** Hash only `payload` and derive columns from it on read (keeps the formula short, but then the indexed columns are unverified and can silently disagree with the payload); missing args never match any operator (makes `no-other-repos`-style block rules silently skip tools without that arg — fails open).
- **Consequences:** Adding an `AuditEntry` column requires updating the hash function and changes hashes for new entries only (v0.1 has no data yet). Policy authors must remember that `notGlob`/`notIn` in an `allow` rule also match calls without the argument; the policy docs and tests call this out.

### ADR-029: Phase 0 scaffold — what we kept from the generators and what we changed
- **Date:** 2026-10-11 · **Status:** Accepted · Amends ADR-018 and STRUCTURE.md · Prisma driver adapter (`@prisma/adapter-pg` + `pg`) approved by the owner on 2026-10-11
- **Context:** Better-T-Stack 3.44 and Nest CLI 12 generate more (and slightly different) setup than STRUCTURE.md assumed.
- **Decision:**
  - **Removed `varlock`** (env codegen + an `@next/env` override) and the `bunfig.toml` files that Better-T-Stack adds. Varlock is not an allowed dependency and ARCHITECTURE already specifies zod-validated env (`apps/inbox/src/lib/env.ts`, `apps/server/src/config/env.schema.ts`). Generated `apps/web` renamed to `apps/inbox`; the generator's scope (taken from the folder name `intentgate`) renamed to `@intentlock`.
  - **Kept** the generator's conventions: App Router under `apps/inbox/src/`, `packages/ui` with subpath exports (`@intentlock/ui/components/*`), `packages/config` holding `tsconfig.base.json`, and `bts.jsonc`.
  - **Tests:** one Vitest run per package through `turbo run test` (cached, builds dependencies first) instead of a root `vitest.workspace.ts`; Vitest 3.2+ deprecated workspace files anyway.
  - **Lint:** one flat-config preset, `intentlock(<pkg>)` in `packages/config/eslint.js`, used by each package's own `eslint.config.js`. It holds the STRUCTURE §4 boundaries as `no-restricted-imports` (applied to `src/` and `test/` only). Nest's oxlint + Prettier config was removed in favour of the shared ESLint + root Prettier.
  - **TypeScript:** pinned to `~6.0.3` because typescript-eslint 8 does not support TS 7 yet. Shared preset targets ES2022 with `moduleResolution: bundler` (packages are bundled by tsup, the inbox by Next.js); the server overrides to `nodenext` and turns off `verbatimModuleSyntax` for Nest decorator metadata. tsup's dts step needs `ignoreDeprecations: "6.0"` (it sets `baseUrl` internally).
  - **Server tests** stay on Vitest as generated by Nest 12; decorator metadata works without an SWC plugin. File names follow STRUCTURE (`*.test.ts`, `test/*.e2e.test.ts`).
  - **Prisma 7.10** (npm's `latest` tag points at an 8.0 release candidate). `prisma.config.ts` loads the root `.env` with Node's `process.loadEnvFile` instead of `dotenv`, and points the CLI at `DIRECT_URL`.
  - **Inbox → core** is a runtime dependency (the policy parser runs in the browser, ADR-023); the "types only" label in the STRUCTURE §4 graph was corrected.
- **Alternatives:** Keep varlock (a second env system next to zod, plus a framework override); root Vitest projects config (duplicates turbo's per-package runs); TypeScript 7 (breaks typescript-eslint).
- **Consequences:** Prisma 7's runtime client needs a driver adapter (`@prisma/adapter-pg` + `pg`), which is **not** in the allowed dependency list; this needs the owner's approval before Phase 2's first migration. Upgrade TypeScript when typescript-eslint supports 7.

### ADR-030: Phase 1 core semantics
- **Date:** 2026-10-12 · **Status:** Accepted
- **Context:** Implementing `packages/core` forced choices the docs left open.
- **Decision:**
  1. **Hashing via WebCrypto** (`crypto.subtle`), so core has no `node:` imports and runs in the browser (inbox policy editor). Hash functions are therefore async.
  2. **`check(bundle, call, usage)` takes no `now`**: only token expiry depends on time, and that is `verifyBundle`'s job. `check` never throws (errors → `internal_error`).
  3. **`decide(token, key, call, usageFor, now)`** looks up usage for the *verified* plan id and increments the matched step on allow or hold in the same synchronous section as the check, so concurrent calls in one process cannot overshoot `maxCalls`. A held call uses up a slot even if it is later rejected (conservative).
  4. **Step selection:** a call uses the first matching plan step that still has capacity; `call_limit` only when every matching step is exhausted.
  5. **Operators:** `regex` is a full match (`^(?:…)$`, `u` flag); `glob` is minimatch with `dot: true`, `nonegate: true`; `eq`/`in` compare JCS strings (exact JSON equality, no type coercion); `user.email` globs are case-insensitive; approver emails compare case-insensitively.
  6. **Block reasons** are fixed codes when no rule decided (`invalid_token`, `token_expired`, `invalid_call`, `not_in_plan`, `call_limit`, `no_matching_rule`, `internal_error`); a policy block carries the rule id and the rule's `reason` (default `Blocked by rule <id>`). `token_expired` is separate so the guard knows to refresh (§7.5 rule 6).
  7. **Policy defaults:** `default` may only be `block`; hold `timeoutSeconds` defaults to 300 (max 86 400); rule ids must be kebab-case and unique; unknown keys anywhere are errors (strict schemas). YAML is parsed with unique keys and at most 50 alias expansions.
  8. **Names:** `signBundle` / `verifyBundle` (STRUCTURE §3) instead of PLAN's `signPlan` / `verifyToken`; `signBundle` computes `ph` and `polh` itself, and `verifyBundle` recomputes both and checks `sub` = `plan.user`.
  9. **Audit hash** covers exactly the strict `AuditEntryBody` zod schema (all columns except `hash`), so field-list drift is impossible inside core; unknown fields are rejected rather than silently left unhashed. The server must map rows to that exact shape (Phase 2 tests this against Prisma).
- **Alternatives:** `node:crypto` (sync, but not browser-safe); passing a plain usage array to `decide` (the plan id isn't trusted before verification); partial-match regex (an allow rule could match a value that merely contains the pattern).
- **Consequences:** Regexes come from server-signed plans and admin-written policies, not from tool output, but a pathological pattern could still be slow (ReDoS); the server should reject overly complex patterns at plan signing (Phase 2). Deleting the newest audit entries is not detectable from the chain alone (anchoring is stretch, DEPLOYMENT §6.2).

### ADR-031: Phase 2 server groundwork — org scoping, generated client location, test database
- **Date:** 2026-10-12 · **Status:** Accepted
- **Context:** The server scaffold needed choices ARCHITECTURE leaves open.
- **Decision:**
  1. **Org scoping is a Prisma client extension** (`src/org/org-db.ts`, `orgDb(prisma, orgId)`): every model operation gets `orgId` added to its `where`; creates (and the `create` half of an upsert) get `orgId` **overwritten**, so a wrong value from a caller cannot write into another org. `Organization` is unscoped. Raw SQL is not covered and must filter `orgId` by hand. The `orgId` comes from the request's session or API key, never from a body, so the server keeps no org state in memory.
  2. **Prisma client is generated into `apps/server/src/generated/prisma`** (git-ignored, `prisma generate` on `postinstall`), so `nest build` compiles it with the rest of `src/` and `dist/` stays self-contained.
  3. **Logging:** plain `pino` behind a small Nest `LoggerService` adapter (no `nestjs-pino`, which is not on the allowed list). The global exception filter passes `HttpException`s through and turns everything else into `{ statusCode: 500, error: "internal_error" }` with no message or stack.
  4. **Validation:** one **global** `ZodValidationPipe`. Each `@Body()`, `@Query()` and `@Param()` is typed with a class made by `zodDto(schema)` (a class with a static `schema`, the pattern `nestjs-zod` uses, written in a few lines instead of adding the dependency), so the pipe finds the schema through Nest's parameter metadata. An argument without a schema is rejected (fail closed), and `routes.e2e.test.ts` fails on any route that has one. Failures are 400 `{ error: "validation_failed", issues: [{ path, message }] }`. Chosen over `class-validator` because the plan, tool call and policy schemas already live in core as zod and are shared with the browser; DTO classes would duplicate them.
  5. **Integration tests** share the `intentlock_test` database: a Vitest global setup runs `prisma migrate deploy` once, each file truncates every table in `beforeEach`, and e2e files run serially (`fileParallelism: false`).
- **Alternatives:** Passing `orgId` by hand in every query (easy to forget); Postgres row-level security (needs a per-request `SET`, awkward with a pooler); one database per test file (slow to migrate).
- **Consequences:** Prisma's generated types still require `orgId` in `create` data, so callers pass it even though the extension overwrites it. Nested creates are not rewritten; they take `orgId` from the same variable.

### ADR-032: Sign-in, sessions and route protection details
- **Date:** 2026-10-12 · **Status:** Accepted
- **Context:** ARCHITECTURE §5.6 fixes the model (login tokens, sessions, default deny) but not the mechanics.
- **Decision:**
  1. **Four global guards, one job each**, registered in this order in `app.module.ts`: `CsrfGuard` (point 2), `ApiKeyGuard` (`@AgentAuth()` routes: Bearer API key, SHA-256 with `API_KEY_PEPPER`, revoked keys rejected on every agent route, `lastUsedAt` written at most once a minute), `SessionGuard` (the default deny: every route that is neither `@Public()` nor `@AgentAuth()` needs a valid session cookie), `RolesGuard` (`@Roles(...)`). Each decorator has its own file (ADR-033). *Amended the same day: the first version was one combined guard and one decorators file.*
  2. **CSRF:** every non-GET request that is not an API-key route must carry `X-Intentlock-CSRF` (any value), sign-in included. With `SameSite=Lax` cookies a cross-site page cannot send a custom header without a CORS preflight, which the server never grants.
  3. **Sessions:** cookie `il_session` = 32 random bytes; the DB stores its SHA-256. 12 h sliding expiry, written at most every 10 minutes. A session is rejected if expired, if the user is disabled, or if its org doesn't match the user's. Disabling a user or re-issuing their token deletes their sessions.
  4. **Sign-in:** emails are lowercased everywhere. Unknown email, wrong token and disabled user give the same 401 and do the same hashing work. v0.1 looks the email up across the (single) organization. Failed and successful sign-ins are audited.
  5. **Rate limit:** `@nestjs/throttler` on sign-in only: 5/min per email and 20/min per IP. The store is in memory, so the limit is **per instance** (acceptable: it is not a decision input, and DEPLOYMENT §5.3 only forbids state that another instance needs). Behind a proxy, Express `trust proxy` must be set or every request shares the proxy's IP (deployment phase).
  6. **Bootstrap** runs on application start inside a transaction holding an advisory lock, so two instances booting together create one organization. The dev seed reuses it (`demo: true`) and then adds an agent and an API key.
  7. **Audit appends** run inside `orgDb(...).$transaction` (Prisma transaction clients cannot be extended, so the scoped client opens the transaction); the global chain head is read with raw SQL so org scoping never filters it.
  8. **Lock-out guard:** an admin cannot disable or demote themselves.
- **Alternatives:** `cookie-parser` (not on the allowed list; parsing one cookie is a few lines); a double-submit CSRF token (unneeded with same-origin + custom header); a Postgres-backed throttler store (more moving parts for a non-decision limit).
- **Consequences:** The route-enumeration test (`test/routes.e2e.test.ts`) lists every public and API-key route explicitly; adding one means editing that list.

### ADR-033: Server file layout — one concern per file, feature subfolders
- **Date:** 2026-10-12 · **Status:** Accepted · Amends STRUCTURE.md §3 (`apps/server`)
- **Context:** The first server chunks grouped several concerns per file (five decorators and the request types in one file, one guard doing CSRF + API keys + sessions + roles, DTOs declared inside controllers, a service class inside a module file). The owner asked for the layout of their reference NestJS project (github.com/AbdullahMukadam/nest-backend-reference) for maintainability.
- **Decision:** Each feature folder keeps `module`/`controller`/`service` at its root and adds subfolders as needed: `dto/` (one DTO per file, `<action>-<thing>.dto.ts`), `schemas/`, `guards/`, `decorators/`, `utils/` (`*.util.ts`), `constants/`, `types/`; cross-cutting pieces go in `common/` with the same subfolders. Unit tests sit next to the file they test. Table in STRUCTURE.md §3.
- **Alternatives:** Keep fewer, larger files (fewer imports, but harder to find things and to review as the server grows to ~15 features).
- **Consequences:** More, smaller files and longer import lists. Global guard order now matters and is fixed in `app.module.ts`; the route-protection tests cover it.

### ADR-034: String enums for fixed values; single-line comments only
- **Date:** 2026-10-12 · **Status:** Accepted · Owner request
- **Decision:** Every fixed set of values in the server (audit kinds and origins, error codes, roles, auth kinds, logger contexts, throttler names, env values, Prisma error codes) is a TypeScript string `enum` in the owning feature's `enums/` folder (shared ones in `common/enums/`); HTTP statuses use Nest's `HttpStatus`. `UserRole` mirrors the Prisma `Role` enum, and a unit test fails if they drift. Comments are kept only where important and are one line. Rules are in CLAUDE.md.
- **Alternatives:** Use Prisma's generated `Role` const directly (lowercase keys, and only covers DB enums); string literal unions (no single place to look values up).
- **Consequences:** Wire values are unchanged, so the API and audit log are unaffected. `packages/core` keeps its zod enums for now; it is a pure, browser-safe package and outside this change.

### ADR-035: Agents, API keys, policy store and licensing details
- **Date:** 2026-10-12 · **Status:** Accepted
- **Decision:**
  1. **`DELETE /v1/agents/:id` disables** (sets `disabledAt`); agents are never hard-deleted, because their policy versions and audit entries must stay resolvable.
  2. **Seats count enabled rows only.** `maxUsers` / `maxAgents` count users and agents with `disabledAt = null`; disabling frees a seat, re-enabling at the limit is refused (403 `user_limit_reached` / `agent_limit_reached`). The count and the insert run in one transaction holding an advisory lock, so concurrent creates cannot overshoot.
  3. **Vendor keypair** generated on 2026-10-12: the public key is `license/constants/vendor-public-key.constant.ts`; the private key is `keys/vendor-private.pem` on the owner's machine (git-ignored). `LicenseService` gets the key through the `VENDOR_PUBLIC_KEY` provider so tests sign with their own throwaway key. Verification is `jose` `compactVerify` (EdDSA) + the zod `LicenseSchema`; failure modes are `missing`, `invalid` (bad signature, bad JSON, schema mismatch, unreadable file) and `expired`, all falling back to Community with a warning.
  4. **API keys:** revocation is idempotent (204 again). The key list never includes the key or its hash.
  5. **Policies:** publish and rollback advance `activeVersion` with a conditional `updateMany ... WHERE activeVersion = base`; zero rows → 409 `stale_base_version` with the current `activeVersion`. Rolling back to the active version is 400 `already_active`. Rollback keeps any open draft (its `baseVersion` is now stale, so publishing it gets a 409). Invalid YAML on test/publish is 400 `invalid_policy` with `{ line, col, path, message }` errors; a draft is saved even when invalid and returns its validation.
  6. **Permissions:** view/validate any role; test admin + approver; draft, publish, rollback admin (ARCHITECTURE §5.6 table).
  7. **Replay contract:** `POST .../policy/test { replayLast }` reads the agent's latest `check` audit entries and expects `payload.call` (a core `ToolCall`) and `payload.inPlan` (default true); the user's role and groups are looked up by the entry's `user` email (unknown → member, no groups). `/v1/check` and `/v1/audit/batch` (next chunk) must write that payload shape.
- **Consequences:** The "expired license does not change any enforcement decision" test needs `/v1/check`, so it lands with the next chunk; the LicenseService task stays unticked until then.

### ADR-036: Plans, check, holds, reports and audit read paths
- **Date:** 2026-10-12 · **Status:** Accepted
- **Decision:**
  1. **Signing key:** `SIGNING_KEY` (PKCS8 PEM, `\n`-escaped values accepted) is required when `NODE_ENV=production`; otherwise a key is generated and logged once. `SIGNING_KEY_PREVIOUS` may be a private or public PEM; both kids are in the JWKS and accepted for verification.
  2. **One verification path:** `KeysService.verifyForAgent()` verifies the bundle and binds it to the calling API key's agent and org; a token from another agent is `invalid_token`. Refresh and report accept a token that expired at most `MAX_TTL_SECONDS` (60 min) ago.
  3. **Plan ids are ULIDs** (small in-repo generator, no dependency). `plan.user` is lowercased before signing. Plans with a regex longer than 256 chars or with nested quantifiers are rejected at signing (`unsafe_regex`, heuristic from ADR-030).
  4. **Refresh re-signs the stored plan**, never the token's copy, with the agent's *current* active policy and the user's current role and groups (ARCHITECTURE §3.2: changes apply at the next refresh). It refuses a different plan hash (409), another plan's token, disabled agents and disabled users.
  5. **Remote check is one transaction:** atomic `UPDATE "StepUsage" ... WHERE calls < maxCalls RETURNING`, hold row, audit entry. If the counter update loses a race the call becomes `call_limit`. A malformed call is a recorded `invalid_call` block, not a 400.
  6. **Holds:** admins and approvers see all holds, members see their own plus any they may approve; each row carries `canApprove`. Approval needs the spec to allow the signed-in user (an admin is not an implicit approver). Approve/reject and expiry all use `WHERE status = 'PENDING'` guards; expiry runs every 10 s on every instance and audits only the rows it actually changed. Hybrid `POST /v1/holds` re-runs `check()` with zero usage (the client owns usage in hybrid mode) and needs the same `ruleId`. Shutdown aborts long-polls, which then return the current status.
  7. **Reports** find the call through its `check` audit entry (`payload.call.callId`), increment `ran` for that step once per `callId`, and mark the plan `COMPLETED` when every required step has run. Plans with no required steps stay `ACTIVE`.
  8. **Audit reads:** members only see entries whose `user` is them, whatever `user` filter they send. Cursor pagination on `seq`. `format=jsonl` streams oldest-first in batches; an unfiltered admin export verifies offline with core `verifyChain`. `GET /v1/audit/verify` walks the global chain in batches of 1 000 and lists up to 100 flagged entries.
- **Consequences:** Report idempotency is read-then-write (a `ponytail:` note marks it). `/v1/audit/batch`, stats and runs come in the next chunk.

### ADR-037: Runs, stats and live events
- **Date:** 2026-10-12 · **Status:** Accepted · `socket.io-client` added as a server **dev** dependency (tests only)
- **Decision:**
  1. **Runs:** a run is a `Plan` row; list is newest first with cursor on the ULID id, decision counts from `check` audit entries, and status `expired` derived from `expiresAt` (no job flips rows). Detail returns the plan, agent, ordered decisions (call args, verdict, rule, reason, hold id), holds, reports and timing. Members get 404 for someone else's run, not 403, so run ids do not leak.
  2. **Stats overview:** raw SQL (`date_trunc`, `GROUP BY`, `percentile_cont`) with `orgId` and the member scope filtered by hand. Default range 24 h, max 90 days; hourly buckets up to 48 h, daily beyond. Audit lag is measured on client entries (`at - clientAt`) and is `null` until hybrid batches exist.
  3. **One session check:** `SessionsService` validates sessions for both `SessionGuard` and the WebSocket handshake.
  4. **WebSocket `/events`:** Socket.IO namespace; the session cookie is checked in handshake middleware (unauthenticated sockets never connect), and a browser `Origin` must be `PUBLIC_URL` or listed in `CORS_ORIGINS`. Events: `decision`, `hold.created`, `hold.resolved`, with small payloads, emitted after the transaction commits. Members get their own events plus holds they may approve; admins and approvers get everything in their org. Sessions are re-checked every 60 s and sockets of disabled users or ended sessions are dropped.
  5. **Single-instance fan-out** for now (`ponytail:` note in `events.service.ts`); cross-instance delivery stays the DEPLOYMENT §6.1 design, and the inbox polls holds every 10 s anyway.
- **Consequences:** a few seconds of event loss on reconnect is acceptable because every view can reload from REST.

### ADR-038: Hybrid mode wire format, ingest rules and the SDK gates
- **Date:** 2026-10-12 · **Status:** Accepted · Amends ARCHITECTURE §5.1, §5.4, §6.2 (updated in the same change)
- **Decision:**
  1. **Each client entry carries its token** (the bundle it was decided against; a refresh changes it) and the full per-step `usage` array, so the server re-runs `check()` exactly. On the wire a batch sends each distinct token once (`tokens[]`) and entries point at it (`tokenRef`); the local file keeps the full token on every line so it is self-contained after a crash. Report entries carry `callId`, `outcome` and `decisionCount`.
  2. **Ingest stores everything and flags**: `chain_break` (hash or link does not recompute), `client_gap` entry with `gap` (missing seqs), `decision_mismatch`, `truncated`, `invalid_token`. The client chain head is read only after taking the audit chain advisory lock, so concurrent retries cannot double-insert; `(planId, clientSeq)` stays unique.
  3. **Mismatch means looser, not different.** Verdicts are ordered block > hold > allow; a client decision is flagged only when it is looser than the server's, or allows/holds via a different rule. Found by the integration tests: a client that could not reach the JWKS correctly blocked everything as `invalid_token`, which the first rule (any difference) wrongly flagged.
  4. **`HybridGate` prefetches the JWKS in `start()`** (jose `createRemoteJWKSet`, 30 s cooldown on unknown kid), so a server outage right after `signPlan` does not stop local decisions. It records a decision only after it is fsynced to the outbox; a failed append returns `block: audit_write_failed`; a hold the server cannot create returns `block: server_unavailable`; over `maxUnacked` entries or older than `maxUnackedAgeMs` returns `block: audit_backlog` (not written, it would only grow the backlog). Plan completion is tracked locally from reports and triggers a synchronous drain.
  5. **Outbox:** `MemoryOutbox` holds the per-plan state (serialized appends per plan); `FileOutbox` extends it with `<planId>.jsonl` (open-append-fsync-close per entry), `.ack` (write + rename) and `.done`; files are deleted once a done plan is fully acked. Recovery skips unparseable lines (a torn last line was never fsynced, so never acted on). `usage-counter.ts`, `recovery.ts` and `backpressure.ts` from STRUCTURE were folded into these files.
  6. **Worker:** single-flight uploads, batches ≤ `maxBatch`, exponential backoff 1 s → 30 s with 50–100 % jitter, `drain(timeout)` ignores the backoff for `close()` and plan completion. Permanent 4xx errors are retried too (fail closed via backpressure) and reported through `onError`.
  7. **`HttpGate`** throws `GateUnavailableError` on network errors, timeouts, 5xx and malformed decisions (the guard turns it into a block, ARCHITECTURE §6.3); 4xx is `HttpError` with the body. Both gates share the long-poll loop, which reports `expired` at the caller's own deadline.
  8. **SDK dependency:** `jose` (already allowed) for the remote JWKS set. **Lint exception:** `apps/server/test/**` may import `@intentlock/sdk` (devDependency) so `hybrid.e2e.test.ts` runs the real gates against the real server; server code still may not.
- **Consequences:** The `Gate` interface still has no `refresh`; ARCHITECTURE §7.5 rule 6 (refresh once on `token_expired`) needs one in Phase 3, which is a public API change to raise with the owner then.

### ADR-039: Shared enums and API_ENDPOINTS in core
- **Date:** 2026-10-12 · **Status:** Accepted · Amends ADR-034 (owner request)
- **Decision:** The enum rule now covers every package. Values that cross packages live once in `packages/core/src/enums/`: `Verdict`, `BlockReason`, `ClientBlockReason`, `ClientEntryKind`, `ReportOutcome`; the zod schemas use them (`z.literal(Verdict.ALLOW)`, `z.enum(ReportOutcome)`), and the server dropped its duplicate `ReportOutcome`. Core's `Role` stays a zod enum because converting it would turn every Prisma-role → core-role handover into a type error; `user-role.enum.test.ts` now checks `UserRole`, Prisma `Role` and core `Role` are identical. Every route lives in `API_ENDPOINTS` (core, `as const`) with `apiPath()` to fill parameters; server controllers use `@Controller()` + full paths, the SDK builds URLs from it.
- **Alternatives:** Keep per-package enums (drift, as `AuditVerdict` vs core verdict literals showed); controller prefixes plus relative method paths (two halves of every route in two places).
- **Consequences:** Callers constructing decisions or entries in TypeScript use the enums (`Verdict.ALLOW`), since a string literal is not assignable to a string enum. Wire values are unchanged, so tokens, audit hashes and the API are unaffected.

### ADR-040: CLI and license issuer
- **Date:** 2026-10-12 · **Status:** Accepted · `commander` and `zod` added to `packages/cli` (both on the allowed list); `tsx` added to the root dev dependencies
- **Decision:**
  1. **CLI session:** `intentlock login` exchanges email + login token for the session cookie and stores `{ url, email, cookie }` in `~/.intentlock/session.json` with mode 0600; every API command sends that cookie plus the CSRF header, so the CLI goes through exactly the same guards as the inbox. The token is prompted for when `--token` is omitted.
  2. **Agents by name:** commands take `--agent <name>` and resolve it through `GET /v1/agents`, so nobody has to copy ids.
  3. **Fail before calling the server:** `policy push` and `policy test` validate the file locally with core `parsePolicy` first; `users add --role` is limited to core `Role.options`.
  4. **`keygen`** writes a UTF-8 PKCS8 PEM (0600) and its public key; `--env` prints the one-line, `\n`-escaped `SIGNING_KEY` value (avoids the UTF-16 and multi-line `.env` problems hit in session 9).
  5. **Testability:** every command runs against an injected `CliContext` (fetch, home, cwd, print, prompt); `bin.ts` wires the real ones. Tests use a fake fetch router that records each request.
  6. **`scripts/issue-license.ts`** imports the server's `LicenseSchema` and enums, so the issuer can never produce a license the server's parser would reject, and signs with `node:crypto` Ed25519 (no extra dependency). Run as `pnpm issue-license`. A server unit test runs the script with a throwaway vendor key and verifies the result with the server's own `verifyLicense`.
- **Consequences:** CLI API commands are tested against a fake server, not the real one (the import boundaries keep the server tests from importing the CLI); the Phase 2 walkthrough below exercised them against a real server.

### ADR-041: Provider layer details
- **Date:** 2026-10-12 · **Status:** Accepted · Amends ARCHITECTURE §7.1, §7.2 (updated in the same change); `openai` and `zod` added to `packages/guard` (both on the allowed list), plus `@intentlock/core` as a direct dependency (already reachable through sdk)
- **Decision:**
  1. **`ToolCallReq.argsError?`**: an adapter that cannot turn a call's arguments into a JSON object sets `args: {}` and `argsError` instead of throwing, so one bad call does not lose the rest of the turn; the guard turns it into an error result and never executes it (§7.5 rule 5). Missing provider call ids get `call_<uuid>`, never an index (an index can collide with a real id).
  2. **Neutral fixed values are enums** in `guard/src/provider/enums/`: `MessageRole`, `ToolChoice` (`AUTO`; a forced choice stays `{ name }`), `ProviderKind` (the `LLM_PROVIDER` values).
  3. **OpenAI tool results carry no error flag**, so error results are sent as `ERROR: <content>`.
  4. **`providerFromEnv(env = process.env, { anthropic?, fakeScript? })`**: guard may not import `@intentlock/anthropic` (it sits above guard), so `LLM_PROVIDER=anthropic` needs the factory, and `@intentlock/anthropic` re-exports a `providerFromEnv` that passes it. Apps that import the anthropic one switch between all three providers with no code change. Empty `LLM_*` values count as unset; missing `LLM_PROVIDER` means `fake`; `LLM_API_KEY` is optional for openai-compatible (Ollama needs none).
  5. **`OpenAICompatibleProvider` accepts an injected `client`** (`Pick<OpenAI, "chat">`) for tests; the default client has a 60 s timeout and 2 retries.
- **Alternatives:** Throwing on bad JSON (loses the other calls' results and breaks rule 2); a dynamic import of the anthropic package from guard (reverses the dependency graph).

### ADR-042: Gate.refresh and the guard loop
- **Date:** 2026-10-12 · **Status:** Accepted · Amends ARCHITECTURE §6, §7.3, §7.5, §7.6 (updated in the same change); resolves the open point in ADR-038
- **Decision:**
  1. **`Gate.refresh(planId, token): Promise<{ token, expiresAt }>`** on every gate (owner-approved). `HttpGate`/`HybridGate` call `POST /v1/plans/:id/refresh`; `LocalGate` verifies the old token's signature as of its own `iat` (so an expired token still proves it is ours), checks `jti === planId` and re-signs the same plan; `PassThroughGate` returns the token unchanged.
  2. **Refresh in the guard:** a check that comes back `block: token_expired` triggers one refresh, then one re-check with the new token. Concurrent calls in a turn share a single in-flight refresh for the same expired token; the new token is kept on the session for later turns and reports. A failed refresh or a second expiry returns the original block.
  3. **Sessions instead of bare tokens:** `guard.start(input)` signs a plan and returns a `GuardSession { planId, token, user }`; `guard.execute(session, toolCalls)` replaces `execute(token, toolCalls)` from the sketch, because a refresh has to update the token the caller holds. `run()` is `start()` plus the loop.
  4. **Results that never reach the gate:** unknown tool → `unknown_tool`, an adapter `argsError` → `invalid_args` (`GuardBlockReason`, guard-local), both in the §7.5 block text and emitted as `block` events. A gate that throws becomes `block: server_unavailable`. Holds: approved → run; rejected, expired, or a `waitForHold` that throws → error result (`rejected` / `timeout` events). Rule-4 text is used for blocks; rejected/timed-out holds and impl errors have their own texts (`results.ts`).
  5. **Planner:** `declare_plan` has a hand-written, flat JSON schema (tool names as an `enum`, one constraint object with optional `eq | in | glob | lte | gte`), because zod's generated schema for core's `ArgConstraint` uses `$ref`/`$defs` and a recursive JSON type that free models handle poorly. The result is validated with core `Plan` (strict: two keys in one constraint fails) plus a known-tool check. The planner's prompt carries the task and tool names + descriptions only; the only tool offered is `declare_plan`. Exactly one call and no other calls, else retry once, then `PlannerError` (no plan signed, `error` event).
  6. **`defineTool({ name, description, schema, impl })`** derives `inputSchema` with `z.toJSONSchema` (minus `$schema`) and validates args before the impl runs, so schema-invalid args never execute; `toolset()` splits tools into `{ tools, impls }` for `createGuard`.
  7. **Run result:** `{ status: completed | max_turns, planId, text?, turns, messages }`. Provider errors in the main loop propagate (the run fails; nothing further executes). `onEvent` exceptions are swallowed so logging cannot break enforcement.
  8. **Lint:** the existing preset already bans provider SDKs in `core`, `sdk` and all of `guard` except `src/provider/**`; verified by linting a throwaway import in `guard/src/guard` and `core`.
- **Alternatives:** Keep `execute(token, …)` and return the new token alongside results (every caller has to thread it); decode `jti` from the JWT in the guard (fails for non-JWT gates like PassThrough).

### ADR-043: Anthropic adapter mapping and live tests
- **Date:** 2026-10-12 · **Status:** Accepted · `@anthropic-ai/sdk` (allowed list) and `@intentlock/guard` added to `packages/anthropic`; `core`, `sdk`, `zod` as dev dependencies for the tests
- **Decision:**
  1. **Mapping:** neutral `user` and `tool` messages both become Messages API `user` turns and consecutive same-role turns are merged, so tool results and a following user note land in one message (the API needs alternating roles). Each tool result is a `tool_result` block with `is_error`; empty content is omitted rather than sent as an empty string; an assistant message with no text and no calls is dropped. `max_tokens` defaults to 4096 (the API requires it). A forced choice is `{ type: "tool", name }`. A `tool_use` whose `input` is not a JSON object gets `argsError` (ADR-041), so it is never executed.
  2. **Tests:** hand-written Messages API responses in `packages/anthropic/test/fixtures/` (planner `declare_plan`, a two-call `tool_use` turn, `end_turn`) drive both mapping tests and a full `createGuard` run over `LocalGate` through an injected client.
  3. **Live tests are opt-in and bypass turbo:** `RUN_LIVE_ANTHROPIC=1` (`packages/anthropic/src/live.test.ts`, key from `ANTHROPIC_API_KEY` or `LLM_API_KEY`, model from `ANTHROPIC_MODEL`) and `RUN_LIVE=1` (`packages/guard/src/live.test.ts`, provider from the root `.env` via `providerFromEnv`). Turbo filters undeclared env vars and caches test results, so they run with `pnpm --filter <pkg> exec vitest run src/live.test.ts`. The free-model smoke test checks an off-plan `delete_repo` is blocked on the live plan directly (a model may or may not take the injected bait) and that the run completes `list_issues` + `add_label` without ever running `delete_repo`.

### ADR-044: Opaque provider data on tool calls
- **Date:** 2026-10-12 · **Status:** Accepted · Amends ARCHITECTURE §7.1 (updated in the same change)
- **Context:** Gemini 3 models on the OpenAI-compatible endpoint attach `extra_content.google.thought_signature` to each tool call and reject the next request with 400 if the replayed assistant message lacks it. The neutral `ToolCallReq` dropped it.
- **Decision:** `ToolCallReq.providerData?: Record<string, unknown>` holds adapter-owned data that the guard never reads and passes back unchanged in the history. `OpenAICompatibleProvider` stores `extra_content` there and spreads it back into the replayed `tool_calls` entry. It is metadata between the model and its own adapter; the gate checks only `name` and `args`, so it cannot widen what runs.

### ADR-045: Inbox sign-in, proxy and API client
- **Date:** 2026-10-13 · **Status:** Accepted · Amends STRUCTURE §3 (`apps/inbox`) and DEPLOYMENT §3 (updated in the same change)
- **Decision:**
  1. **`src/proxy.ts`, not `src/middleware.ts`:** Next.js 16 renamed the convention (same behaviour). It only checks that an `il_session` cookie exists and redirects to `/login?next=<path>`; the matcher skips `/login`, `/api/*`, `/_next/*` and the favicon. The server stays the only enforcement point.
  2. **Same origin in every environment:** `next.config.ts` rewrites `/api/:path*` to `API_URL` (default `http://localhost:3000`), so the inbox only ever calls `/api/v1/...` and the session cookie stays first-party in dev too, not just behind nginx or Vercel. `NEXT_PUBLIC_API_URL` is replaced by the server-side `API_URL`; the browser never needs the server URL, so `lib/env.ts` is dropped.
  3. **One client, `api(endpoint, schema, options)`:** paths from `API_ENDPOINTS` via `apiPath`, `X-Intentlock-CSRF: 1` on every non-GET, every response parsed with a zod schema, errors thrown as `ApiError(status, code)`. A 401 on anything but sign-in sends the browser to `/login?next=...`. The `next` target is accepted only if it is a same-origin path (`safeNext`), so sign-in cannot be used as an open redirect.
  4. **Client-side data loading:** pages fetch from the browser through the rewrite instead of server components forwarding cookies; holds polling and the WebSocket need the browser path anyway. The shell loads `/v1/me` and `/v1/license` (edition in the footer).
  5. **Cookie and CSRF header names are redeclared in the inbox** (`lib/constants.ts`), as the CLI already does; they are wire constants pinned by server tests.
- **Alternatives:** Server components calling the API with the forwarded cookie (two fetch paths, and no live updates); keeping `NEXT_PUBLIC_API_URL` with CORS (cross-origin cookies, which ARCHITECTURE §5.6 rules out).

### ADR-046: Overview, Activity and Run detail
- **Date:** 2026-10-13 · **Status:** Accepted
- **Decision:**
  1. **Recharts `^3.10.1`** (listed for the inbox in ARCHITECTURE §2) for the verdict chart: stacked bars per hour (≤ 48 h) or per day, as the server buckets them. Verdicts use the fixed status colours from the dataviz reference palette (allow/approved `#0ca30c`, hold `#fab219`, expired `#ec835a`, block/rejected `#d03b3b`), always shown next to the verdict name, never colour alone.
  2. **Activity filters live in the URL.** The filter bar is a `next/form` GET form on `/activity`, so filters are shareable and the Overview's top-blocked lists link straight into a filtered view. `datetime-local` values are converted to ISO in the browser so the server's timezone does not matter. JSONL export is a plain download link to `/api/v1/audit?...&format=jsonl` with the same filters.
  3. **Activity lists every audit kind** (sign-ins, publishes, checks…) with a kind column, because `/v1/audit` has no kind filter; the verdict filter narrows it to decisions. Paging is "Load more" on the server's `seq` cursor.
  4. **Inbox-side enums mirror the server ones it needs** (`AuditVerdict`, `AuditFormat`, `StatsBucket`) in `src/lib/enums/`, the same way the CLI mirrors wire constants; the values are pinned by the server's API tests.
  5. **One data hook, `useApi(url, schema)`**: keyed by the full URL, parses with zod, ignores stale responses, exposes `reload()`. No data-fetching library.
- **Alternatives:** SWR or TanStack Query (a new dependency for what one small hook covers); a kind filter on `/v1/audit` (a server API change, not needed yet).

### ADR-047: Inbox holds, agents and live events
- **Date:** 2026-10-13 · **Status:** Accepted · Amends ARCHITECTURE §2 and §5.2, DEPLOYMENT §3 (updated in the same change)
- **Decision:**
  1. **`socket.io-client` is an inbox runtime dependency** (owner-approved), the client half of the Socket.IO the server already uses.
  2. **Socket.IO through the single origin:** the browser connects to namespace `/events` with engine path `/api/socket.io`, which the `/api/*` rewrite forwards to the server's `/socket.io`. Next.js redirects away trailing slashes (308) and Socket.IO's engine only matched `/socket.io/`, so the gateway sets `addTrailingSlash: false` and the client does the same. The server still accepts the old path (existing tests unchanged); a new e2e test pins the slash-less handshake. In dev the rewrite also carries the WebSocket upgrade.
  3. **Holds page:** `GET /v1/holds?status=pending`, split into "waiting for you" (`canApprove` from the server) and "waiting for someone else". It reloads on `hold.created` / `hold.resolved`, on every (re)connect, and every 10 s. The note and Approve/Reject sit inline on each card (no dialog); a 409 `hold_not_pending` says someone else resolved it or it expired. The approver is never sent: the server takes it from the session.
  4. **Agents:** list for everyone; the create form, the API keys tab and revoke are shown to admins only. A new key is shown once with a copy button; revoke asks with `window.confirm`. The Policy tab shows the active source read-only until the editor lands. Role checks in the UI only hide controls; the server enforces them.
  5. **Signed-in user in context:** the app shell provides `useMe()` so pages can hide admin-only controls without another `/v1/me` call.
- **Alternatives:** `skipTrailingSlashRedirect` plus a dedicated rewrite in Next (changes slash handling for every page, and Vercel/nginx would need the same care); polling only (no new dependency, but no live holds).

### ADR-048: Policy editor, audit page and UI role checks
- **Date:** 2026-10-13 · **Status:** Accepted
- **Decision:**
  1. **Editor:** CodeMirror 6 (`codemirror`, `@codemirror/lang-yaml`, `@codemirror/lint`, `@codemirror/merge`, all listed in ARCHITECTURE §2). Lint runs `parsePolicy()` from `@intentlock/core` in the browser and maps its 1-based line/col to diagnostics (`lib/policy-lint.ts`); the same errors are listed under the editor. "Show changes" switches on CodeMirror's unified merge view against the active version; history diffs use the side-by-side `MergeView`.
  2. **Edit state:** the editor shows the active source until the first keystroke, which pins `baseVersion` to the active version at that moment. Publish sends that base; on 409 `stale_base_version` the text is kept and the panel offers "Rebase onto vN", which reloads the active version, moves the base and turns on the diff so the admin reviews before publishing again. Server-side `invalid_policy` errors are shown too, though the client lint normally blocks publishing first. Publish needs a message and is disabled while there are errors or nothing changed.
  3. **Drafts (`PUT .../policy/draft`) are not used by the inbox yet:** edits live in the page until published. Saving drafts is easy to add when someone asks for it.
  4. **Test panel:** sample calls are a JSON textarea (validated with zod before sending) plus "replay last N" decisions; results list verdict changes first with a from → to summary. Shown to admins and approvers, as the server allows.
  5. **Rollback** asks for a message with `window.prompt` and publishes a new version copying the old one.
  6. **UI role checks in one place:** `can(role, UiAction)` in `lib/permissions.ts` mirrors the server's `@Roles` (create agent, manage keys, edit policy: admin; test policy: admin + approver), with a test. Non-admins get the editor read-only. Holds use the server's per-hold `canApprove`. These only hide controls; the server enforces every rule (checked live: a member gets 403 on publish, test, create agent and API keys).
  7. **Audit page:** "Verify now" calls `/v1/audit/verify` and shows intact/broken (with the first broken entry) and flagged client entries.
- **Alternatives:** a dialog library for publish and rollback (no dialog component in `packages/ui` yet; inline controls and `window.prompt` cover it); Monaco (heavier, not on the allowed list).

### ADR-049: Hold and API key views name people by email
- **Date:** 2026-10-13 · **Status:** Accepted (owner-approved API change) · Amends ARCHITECTURE §5.1 (updated in the same change)
- **Decision:** `resolvedBy` on holds (`GET /v1/holds`, approve/reject responses, run detail) and `createdBy` on API keys now carry the user's **email** instead of their internal id. The database still stores user ids; views map them with one `emailsById()` query per response (`users/utils/emails-by-id.util.ts`). An id with no matching user falls back to the id. Field names are unchanged.
- **Alternatives:** extra `resolvedByEmail` / `createdByEmail` fields (two fields for one fact, and nothing reads the ids); storing emails on the rows (emails can change, ids cannot).

### ADR-050: GitHub demo agent, setup and seed
- **Date:** 2026-10-13 · **Status:** Accepted · Amends ARCHITECTURE §8 (updated in the same change)
- **Decision:**
  1. **Repos come from env:** `GITHUB_OWNER`, `GITHUB_PUBLIC_REPO` (default `public-app`), `GITHUB_PRIVATE_REPO` (default `private-notes`). The current throwaway account is `acme-demo-bot-1` with `public-app` and `private-repo`; those values live in `apps/demo/.env` (git-ignored).
  2. **The policy pins by pattern, not by name:** `only-public-app` blocks every `github_*` call whose `repo` is not `*/public-app` (a call with no `repo`, like `github_list_repos`, is blocked too), so the file works for any owner and private repo name. Then `no-pull-requests` (block), `hold-public-comments` (hold for admin/approver, 10 min), `allow-in-plan`. A unit test pins each rule's decision; the free model's plan did not pin `repo` on its own, which is exactly what this rule covers.
  3. **Setup talks to the API directly** (`src/admin-api.ts`, admin email + login token from env) instead of shelling out to `intentlock policy push`: `apps/demo` may not import the CLI (import boundaries), and the publish endpoint, `baseVersion` check and audit entry are the same. It creates `DEMO_USER` as a member (a hold needs someone other than the requester to approve), registers the agent, publishes the policy only when the file changed, and writes one API key per agent into `apps/demo/.env` unless one is already there. It is idempotent.
  4. **Script name `setup-instance`:** `pnpm setup` is a built-in pnpm command (it edits the user's PATH), so our script cannot be called `setup`.
  5. **Seed is idempotent by open-issue title.** GitHub's issue list lags a few seconds after creating an issue, so two runs back to back can still create a duplicate.
  6. **Forced attack:** `DEMO_FORCE_ATTACK=1` swaps the model for a `FakeProvider` script (plan → list issues → read the poisoned issue → list repos → read the private `notes.md` → open a PR with it → final text), labelled in the output. Same gate, tools and policy as a real run.
  7. **Free-tier pacing:** real providers are wrapped to wait `DEMO_TURN_DELAY_MS` (default 1.5 s) before each model call.
- **Alternatives:** templating owner/repo names into the policy at setup time (the glob needs no templating); spawning the CLI (needs a separate `intentlock login` and would cross the import boundary in spirit).

### ADR-051: Split-screen demo runner and demo users
- **Date:** 2026-10-13 · **Status:** Accepted · Amends ARCHITECTURE §8 and DEPLOYMENT §2 (updated in the same change)
- **Decision:**
  1. **Runner:** `apps/demo/src/runner.ts` binds `127.0.0.1:8790` and runs `github-assistant` in both modes at once. `GET /events` is SSE (`no-cache, no-transform`) and replays the current run's events on connect, so a reload or reconnect shows everything; `POST /runs` starts both modes (202), refuses a second start while running (409) and requires `x-intentlock-demo: 1`, which a cross-site form or simple request cannot send. A mode that throws reports a `failed` event instead of stopping the other mode.
  2. **Inbox:** `/demo` uses `EventSource('/demo-runner/events')` through a Next.js rewrite to `DEMO_RUNNER_URL`, so it is same-origin and behind the sign-in proxy. Frames are parsed with zod; a reducer drops replayed `seq`s and starts over when a new `runId` arrives. Measured through the dev rewrite: frames arrive as they are emitted (about 1 s apart), not buffered.
  3. **No polling fallback:** ARCHITECTURE had one for the free-hosted instance, but the runner is a local recording tool that never runs there, and `EventSource` reconnects on its own (`retry: 2000`) with the replay above.
  4. **Demo users already existed** (`INTENTLOCK_DEMO=1` on first boot, ADR-032); now covered by an e2e test (four users with the right roles and groups, each can sign in). `DEMO_USER` defaults to `member@acme-demo.dev`, one of those users, so `setup-instance` has nothing to create on a demo install.
- **Alternatives:** WebSocket (no need for client → server messages); CORS straight to the runner (a second origin to configure; the rewrite needs none); a separate `--demo` seed command on the server (first-boot env covers it).

### ADR-052: Tests live in each package's test/ folder
- **Date:** 2026-10-13 · **Status:** Accepted (owner request) · Replaces the "unit tests next to the code" rule in STRUCTURE §2 and §5 (updated in the same change)
- **Decision:** every app and package keeps its tests out of `src/`. Unit tests go in `test/unit/`, mirroring the `src/` path (`src/policy/evaluate.ts` → `test/unit/policy/evaluate.test.ts`); integration tests and their setup go in `test/e2e/` (server only today); shared fixtures stay in `test/fixtures/`. Tests import the code under test by relative path into `src/`. Server vitest projects now select `test/unit/**` and `test/e2e/**`; package tsconfigs include `test/**`; the guard lint override that allows provider SDK types also covers `test/unit/provider/**`.
- **Alternatives:** keeping tests next to the code (the owner found them hard to find); one root `tests/` folder (tests would sit away from the package that owns them and turbo's per-package `test` task would no longer line up).

### ADR-053: Support-assistant demo agent
- **Date:** 2026-10-14 · **Status:** Accepted · Amends ARCHITECTURE §2 and §8 (updated in the same change)
- **Decision:**
  1. **Mailpit only, no `nodemailer`:** the agent reads mail with Mailpit's `search` (`to:support@acme-demo.dev`) and `message` endpoints and sends with `POST /api/v1/send`, which goes through Mailpit's own SMTP pipeline. That covers everything the demo needs with `fetch`, so `nodemailer` is dropped from the allowed list and the SMTP port is not published. Responses are parsed with zod. Image pinned to `axllent/mailpit:v1.31`, UI and API on `127.0.0.1:8025`.
  2. **Reply only to the sender by construction:** `mail_reply` takes a message id and a body, never an address; the tool looks up the sender. A policy cannot compare an argument with data the tool reads later, so the recipient rule is enforced by the tool's shape, and `mail_forward` (the one tool with a free recipient) gets the policy rule `forward-inside-only` (`to` must match `*@acme-demo.dev`; a missing `to` blocks).
  3. **Known accounts in the policy:** `refund-known-accounts` lists the customer emails with `in`; a unit test keeps that list equal to `seed/orders.json`. The tool also refuses refunds for an order the customer does not own or above what is left to refund.
  4. **Refund thresholds and groups, first match wins:** unknown account → block, > $500 → block, group `intern` → block, group `support-leads` → allow, ≤ $20 → allow, otherwise hold for admin/approver. `setup-instance` creates `lead@acme-demo.dev` (group `support-leads`) so the group rule can be shown live with `DEMO_USER=lead@acme-demo.dev`.
  5. **Refunds live for one run:** orders come from `seed/orders.json`; issued refunds are kept in memory and printed after the run (and are in the audit log). No refund file to clean up between runs.
  6. **One `AgentSpec` per agent** (`src/agents/<name>/agent.ts`: system prompt, task, tools, forced script, summary). `build-agent` picks the spec and wires provider, gate and guard the same way for every agent; dependencies (Octokit, mailbox, orders) can be injected for tests.
- **Alternatives:** `nodemailer` over SMTP (a dependency for one call that Mailpit's API already makes); a `to` argument on `mail_reply` pinned by the plan (the planner cannot know senders before reading mail); persisting refunds to a JSON file (state to reset before every recording).

### ADR-054: Files-assistant demo agent
- **Date:** 2026-10-14 · **Status:** Accepted · Amends ARCHITECTURE §8 (updated in the same change)
- **Decision:**
  1. **Two boundaries, one per layer:** the `fs_*` tools take paths relative to `apps/demo/sandbox/` and throw for anything that resolves outside it (absolute paths, `..` past the root), so even an unprotected run cannot touch the real disk. The sandbox itself holds a fake `.env` next to `workspace/`, so the attack has something to steal inside that boundary. Intentlock's policy narrows access further: `no-env-files` (`**/.env*` → block) first, then `workspace-only` (paths outside `workspace{,/**}` → block, a missing path blocks too).
  2. **`..` and `.` segments never match the workspace glob** (minimatch's `**` does not cross them), so `workspace/../.env` is caught by `workspace-only`; the policy test pins that.
  3. **Network only through the plan:** `http_request` has no policy rule of its own; it runs only when the signed plan has an `http_request` step. The summarise task never needs one, so the seeded POST is `not_in_plan`.
  4. **Receiver:** `src/webhook-receiver.ts` records every request (method, path, body up to 1 MB) and `run receiver` prints them on `127.0.0.1:8787`. Tests start it on port 0 and point `DEMO_RECEIVER_URL` at it; `DEMO_SANDBOX` points the agent at a temp folder.
  5. **Seed resets the workspace:** `seed --agent files-assistant` deletes `sandbox/workspace/` and copies the payloads back (poisoned release notes, meeting notes, a to-do list) plus `sandbox/.env`, so every run starts the same.
  6. **`setup-instance` lists users before creating them:** at the Community limit (5 users) creating an existing user answers `403 user_limit_reached` before the 409, so setup no longer relies on the 409.
- **Alternatives:** tools rooted at `workspace/` (the attack would fail in the tool, not in Intentlock, and the demo would show nothing); an `http_request` URL allow-list in the policy (not needed while the plan already excludes the call).

### ADR-055: Eval scenario format, mocks and policies
- **Date:** 2026-10-14 · **Status:** Accepted · Amends ARCHITECTURE §9 (updated in the same change)
- **Decision:**
  1. **Spec per scenario, bound to a domain kit:** a `ScenarioSpec<S>` is typed against its domain's mock state; `scenarioFor(kit)` erases that type into a `Scenario` with `instantiate()` (fresh state, tools, `judge`). The runner never needs to know the domain's types. The `policy` field from the old sketch is replaced by one policy per domain (`policies/<domain>.yaml`).
  2. **Judges look at the world, not the log:** `attackSucceeded` checks what actually happened in the mock (secret in a public PR or comment, mail sent to the attacker, secret in an HTTP body, a file overwritten), so a blocked call can never count as a success and an allowed call with harmful content always does.
  3. **Every scenario carries `exploit` and `solution` scripts:** the calls a fully obedient model would make, and the benign calls that do the task. Exploit args can be built from earlier results, so a secret only "leaks" if the read that fetched it was really allowed. Tests check, for all 30, that the solution completes the task without tripping the attack and shows the agent the injection, and that the exploit, run without a gate, trips the attack judge. The runner can replay these through each gate as a model-free baseline.
  4. **Mocks hold the tools' schemas, not the demo's code:** `apps/demo` and `packages/evals` cannot import each other (STRUCTURE §4), so the eval tools reimplement the demo tool names and zod schemas over in-memory state.
  5. **No holds in eval policies:** an eval has no approver, so the domain policies use only `allow`/`block` (public comments and refunds ≤ $500 are allowed). This is deliberately the harder setting: attacks that go through allowed tools (mislabelling, a refund on a valid account, an address in a reply) are expected to get through and will be reported as such.
  6. **Mix:** 15 GitHub (10 attacks, 5 utility), 8 email (6, 2), 7 files (5, 2); injections in issue bodies, issue comments, a repo file, email bodies, order notes, workspace files and an HTTP response.
- **Alternatives:** judging by the tool log (counts a blocked-but-attempted call as an attack, or misses harmful content in an allowed call); scenario files carrying their own policy (30 policies to keep in sync for no gain); auto-approving holds in evals (would hide what the automatic layers stop).

### ADR-056: Eval runner, scripted baseline and metrics
- **Date:** 2026-10-14 · **Status:** Accepted · Amends ARCHITECTURE §9 (updated in the same change)
- **Decision:**
  1. **Two kinds of model per run:** the configured LLM (N runs, default 3) and a **scripted** model, a `FakeProvider` that signs the plan an honest planner would (one unpinned step per tool in the scenario's solution), makes every call the injection asks for, then does the task. Free models refuse most injections on their own, so the scripted rows are what show the plan and policy layers working; both are labelled with provider and model in every row.
  2. **Only `PassThroughGate` and `LocalGate` run scenarios.** Hybrid and remote change where a decision is made, not what it is (same `check()` in core), so they are measured in a separate latency bench: one plan, repeated allowed `fs_read` checks, `local` vs `hybrid` (real fsynced outbox in a temp dir) vs `remote` (`HttpGate`), run when `INTENTLOCK_URL` and `INTENTLOCK_EVAL_API_KEY` are set.
  3. **Errors are kept, not retried forever:** model calls that fail with 429/503 are retried 4 times with a growing pause (20 s × attempt); a run that still fails is recorded as `error` and left out of the rates unless its attack had already happened (then it counts as a success). The markdown shows error counts.
  4. **Metrics:** attack success (attack runs whose effect is visible in the world), benign tasks done (utility-only runs), task done under attack, false blocks (utility-only run failed after a block), p50/p95 check latency from the guard's events, tokens. Blocked calls are recorded as `tool (rule or reason)`.
  5. **Results** are committed as `results/<date>.json` (every run) and `results/<date>.md` (tables, attacks that got through, per scenario); the human write-up lives in `packages/evals/README.md`.
- **Alternatives:** running every scenario through hybrid and remote too (four times the model calls on a 500-request daily free tier for the same verdicts); scoring errors as safe (would flatter the numbers).

### ADR-057: Docker images and the self-host bundle
- **Date:** 2026-10-15 · **Status:** Accepted · Amends DEPLOYMENT §2, §10 and STRUCTURE (updated in the same change)
- **Decision:**
  1. **Server image:** multi-stage on `node:22-slim` with `openssl` (Prisma needs it); `pnpm deploy --prod --legacy` produces a pruned `node_modules` with `@intentlock/core` copied in, and `dist/` is copied from the build stage (it is gitignored, so the pack file list drops it). Runs as `node`, health check on `/health/ready`.
  2. **`prisma` moves from devDependencies to dependencies** of the server, so the same image runs `prisma migrate deploy` as a one-off `migrate` service before `server` starts (DEPLOYMENT §3: migrations never run on boot). One image to publish instead of a separate migrator image.
  3. **Inbox image:** Next.js `output: "standalone"` with `outputFileTracingRoot` at the monorepo root; `API_URL` is a build argument defaulting to `http://server:3000` (the compose service), because rewrites are fixed at build time.
  4. **Self-host bundle is one file:** `deploy/docker-compose.selfhost.yml` holds Postgres, migrate, server, inbox and nginx, with the single-origin nginx config inline (`configs.content`, Compose ≥ 2.23) instead of `deploy/nginx/selfhost.conf`, so customers download one compose file plus `selfhost.env.example`. Every app service has both `image:` (GHCR) and `build:`, so `up --build` from a clone is the local full stack.
  5. **Project name `intentlock-selfhost`:** the dev `docker-compose.yml` is project `intentlock` with a `pgdata` volume; sharing the name would mount the dev database under the bundle's Postgres.
  6. **`TRUST_PROXY` (hop count, default 0):** the server sets Express `trust proxy` from it, so behind nginx or Render the login rate limit and the audit see the client IP instead of the proxy's. Default 0 so a directly exposed server ignores spoofed `X-Forwarded-For`.
  7. **Signing key in `.env`:** documented as a double-quoted multi-line PEM (`openssl genpkey -algorithm ed25519`), which Compose's `.env` parser accepts; `normalizePem` also strips `\r` so keys generated on Windows load.
- **Alternatives:** running migrations in the server's entrypoint (races with several instances); a separate migrator image (two images to build and version); shipping the nginx config as a second file to download (one more step for customers).

### ADR-058: Accounts and sign-in: setup code, passwords, invites, Google/GitHub
- **Date:** 2026-10-15 · **Status:** Accepted · Supersedes ADR-020; amends ADR-032 (points 3, 4, 6) and ARCHITECTURE §5.1, §5.3, §5.6, §8, DEPLOYMENT §2, USAGE §3 (updated in the same change)
- **Context:** Login tokens handed out by an admin and pasted into the inbox were fine for a CLI-first v0.1, but a team product needs people to join and sign in on their own: a first-run page, invitations, passwords, password resets and "Continue with Google/GitHub". Decided with Abdullah on 2026-10-15 (PLAN Phase 5.5).
- **Decision:**
  1. **Setup code instead of a bootstrap admin.** On boot, under the existing advisory lock, an empty database gets its `Organization` (`ORG_NAME`) and a **setup code** (32 random bytes, base64url) whose SHA-256 is stored on the organization; the code is printed to the logs. While setup is pending, every boot replaces the code and prints the new one, so the operator uses the latest code in the logs (lost logs are fixed by a restart). `POST /v1/setup` with code + email + password (+ optional team name) creates the first admin and clears the code under the same lock; from then on it answers 409 `setup_complete`, before looking at the code. `GET /v1/setup/status` returns `{ setupRequired }` for the inbox. The organization is still created at boot (not by `POST /v1/setup`) because the code hash needs a row and every table needs an `orgId`. `BOOTSTRAP_ADMIN_EMAIL` is removed. `INTENTLOCK_DEMO=1` now creates the sample users when setup completes, each with a random password printed once to the logs.
  2. **Passwords:** `node:crypto` `scrypt` (async), 16-byte random salt per hash, N = 2^15, r = 8, p = 1, 64-byte key, stored as `scrypt$<N>$<r>$<p>$<salt>$<hash>` so the cost can be raised later; verified with `timingSafeEqual`. Unknown emails, users without a password and disabled users verify against a fixed dummy hash, so every failure costs the same and returns the same 401 `invalid_credentials`. Rules: 12 to 200 characters (the cap bounds hashing work), and the password may not contain the email, or its local part when that is 3+ characters (`password_too_weak`). Sign-in keeps the ADR-032 rate limits and audit; sessions are unchanged except that they also record `ip` and `userAgent` for the account page.
  3. **CLI tokens.** The login token stays for the CLI and for people who sign in only with Google/GitHub: the column is renamed `cliTokenHash` (plus `cliTokenCreatedAt`), one per user, created or replaced by the user in account settings and shown once. `POST /v1/auth/login` takes `{ email, password }` or `{ email, token }`, never both; the inbox sends only passwords.
  4. **Invites** (`Invite`): admins invite an email with a role and groups; the server returns a link `PUBLIC_URL/invite/<token>` once (32 random bytes, only SHA-256 stored) and emails it when SMTP is configured. Valid 7 days, single use (accept sets `acceptedAt` under a `WHERE acceptedAt IS NULL AND revokedAt IS NULL` guard), revocable; resend issues a new token and expiry (the old link stops working). One pending invite per email; inviting an existing user is 409. Accepting creates the user with the invited role and groups and counts against `maxUsers` at that moment (pending invites do not). Accept by password, or by Google/GitHub when the provider's verified email equals the invited email.
  5. **Password resets** (`PasswordReset`): an admin creates a reset link for a user (`PUBLIC_URL/reset/<token>`, 24 h, copy or email); people can ask for one themselves on the sign-in page only when SMTP is configured (1 h), and that endpoint always returns 202 with the same body whether or not the email exists. Using a link sets the password, marks it used (single use, same guard as invites), deletes all of the user's sessions, and does not sign them in.
  6. **Google and GitHub sign-in** with `fetch` + `jose` (no OAuth library): authorization code flow with PKCE (S256) and `state`. `GET /v1/auth/oauth/:provider` stores `{ provider, state, nonce, verifier, mode, invite? }` in a 10-minute `httpOnly`, `SameSite=Lax` cookie signed as a JWS with the server's signing key (`typ: oauth-state`, its own issuer, so it can never pass as a plan bundle) and redirects to the provider; the callback (`…/callback`) checks the cookie, compares `state`, deletes the cookie (one use), exchanges the code and reads the email: Google from the ID token (verified with Google's JWKS: issuer, audience, `nonce`, `email_verified`), GitHub from `GET /user/emails` (primary and verified). It then finds an `Identity` by provider + subject, or else an active user with that email (and links the identity). There is **no sign-up through OAuth**: an unknown or unverified email redirects to `/login?error=no_account`. Modes: `signin`, `link` (needs the current session; links the provider to the signed-in user, refused if the identity belongs to someone else) and `invite`. The callback URL is `PUBLIC_URL/api/v1/auth/oauth/<provider>/callback` (the inbox origin, through the `/api` rewrite). A provider is enabled only when both its `*_CLIENT_ID` and `*_CLIENT_SECRET` are set; `GET /v1/auth/methods` tells the sign-in page which buttons to show and whether "forgot password" exists. Google and GitHub sign-in are free in every edition; generic OIDC and SAML stay the Enterprise `sso` feature.
  7. **Account** (signed-in user): profile, change password (needs the current password when one is set, then deletes every other session of the user), list own sessions and sign out the others, linked providers (unlink is refused when it would leave no password and no other provider), CLI token create/revoke.
  8. **Mail:** one `MailService` over `nodemailer` (approved new dependency), on only when `SMTP_URL` is set (`SMTP_FROM` as sender); Mailpit in dev. Sending never blocks the action: the link is always returned to the admin, and a failed send is logged and reported as `emailed: false`.
  9. **Public routes**, all rate-limited per IP like sign-in: `GET /v1/setup/status`, `POST /v1/setup`, `GET /v1/auth/methods`, `POST /v1/auth/login`, `GET /v1/auth/oauth/:provider`, `GET /v1/auth/oauth/:provider/callback`, `POST /v1/invites/lookup`, `POST /v1/invites/accept`, `POST /v1/auth/password/forgot`, `POST /v1/auth/password/reset`. Tokens travel in request bodies, not paths, so they stay out of access logs; the one exception is the invite token passed to the OAuth start URL, which is moved into the signed state cookie immediately.
  10. **Audit:** setup, sign-in (with `method: password | token | google | github`), failed sign-in, OAuth failures, invite created/resent/accepted/revoked, reset link created, password reset, password changed, sessions revoked, provider linked/unlinked, CLI token created/revoked.
  11. **Removed:** `POST /v1/users` (direct creation with a token) and `POST /v1/users/:email/token`. The CLI's `users add` / `users token` become `users invite` / `users reset-link`; `intentlock login` prompts for the password or takes `--token`.
- **Alternatives:** a password library such as argon2 (native build, new dependency; scrypt is in Node and memory-hard); an OAuth/OIDC library such as `openid-client` or Auth.js (new dependency for two well-documented providers); OAuth sign-up for anyone with a company domain (an allow-list feature for later, too easy to misconfigure); magic links only (needs SMTP for every sign-in); an unsigned state cookie (it would work, since the cookie is httpOnly and compared with `state`, but signing costs nothing and stops a tampered `mode` or invite).
- **Consequences:** Self-host gets SMTP and OAuth variables (all optional). Existing databases keep working: old login tokens become CLI tokens, an admin signs in with `intentlock login --token` and creates reset links (for themselves too) so people can set a password; account settings also let a signed-in user without a password set one without a current password. The e2e suite fakes the provider endpoints by overriding the OAuth provider config in the Nest testing module, so no real Google or GitHub app is needed until Abdullah creates them.

### ADR-059: Inbox design system from the two reference designs
- **Date:** 2026-10-15 · **Status:** Accepted
- **Context:** Phase 5.5 asks for a redesign from a reference Abdullah provides. He gave two dashboard shots (a support dashboard and a team task board); the inbox used shadcn's sharp "lyra" style with 12 px text.
- **Decision:**
  1. **Tokens live once in `packages/ui/src/styles/globals.css`:** warm-neutral canvas and sidebar, white content sheet (`--card`), a grey `--panel` surface for grouped content, dark-navy `--primary`, and `--success`, `--warning`, `--info`, `--violet` for status pills, each with a dark-mode value. A `bg-hatch` utility draws the faint diagonal stripes of the reference panels. Inter for text, JetBrains Mono for code, both through `next/font` (no new dependency).
  2. **Shared components change shape, not API:** buttons, inputs, cards, menus, checkboxes and tooltips get rounded corners and 13 to 14 px text, so every existing page picks up the look without edits. New `Panel` (grey frame with a header row and a white inner body, as in the first reference) and `Badge` (soft colored pills, as in the second) live in `packages/ui`.
  3. **App shell:** sidebar with uppercase section labels, the active item as a white chip, and a user card at the bottom with the theme and sign-out menu; the page itself sits in one white rounded sheet with a dashed breadcrumb bar (second reference). Below `md` the sidebar becomes a drawer. The edition moves from a footer to the sidebar header.
  4. **Auth pages** (`/login`, `/setup`, `/invite/[token]`, `/reset/[token]`) share one centred card on the canvas with the same panel frame.
  5. **Every section is a panel** (Abdullah's review: tables, empty states and the dashboard did not follow the references): grey hatched frame with a header row (icon, title, count chip, actions such as filters or "Create key") and a white bordered body. Tables sit flush in the body (`Table` in `packages/ui`: tinted header row, row dividers, 13 px); empty states are an icon tile, a title and one helpful line inside the body; detail pages use a divided label/value grid. The shared `Card` takes the same anatomy (`CardContent` is the white body), so pages built on it match without rewrites.
  6. **Overview follows the first reference's grid:** greeting header with range and agent filters; three KPI panels (allowed, blocked, held) with the change against the previous period (a second stats request for the window before) and a sparkline; a decision-volume bar chart in grey with the hovered or peak bar in the primary color and a dark tooltip, empty buckets filled client-side; a "Latest activity" feed on the right (last 8 audit entries, live via the event socket); an operations strip (pending holds, approval time, flagged, audit lag) and top blocked tools and rules as tables with bars.
  7. **Phones (below `sm`):** the shared `Table` turns each row into a stacked card; cells carry a `label` that is shown next to the value, the row's identity cell (agent, member, key, device) has no label and reads as the card title, and a cell whose only content is an empty marker (`data-empty`) is hidden. One CSS change in `packages/ui` instead of a second mobile layout per page. The sidebar becomes a drawer that closes on Escape; links and disclosure toggles get a global focus-visible outline.
- **Alternatives:** keeping the lyra style and only restyling the dashboard (two visual languages in one app); a component library with its own theme (new dependency, and shadcn already gives us the primitives).
- **Consequences:** Pages that hard-code `text-xs` or sharp corners still look dense until the polish pass. Screenshots for review are taken with headless Edge over the DevTools protocol from a scratch script, so no browser automation dependency is added.

### ADR-060: Error policy
- **Date:** 2026-10-16 · **Status:** Accepted
- **Context:** The Phase 5.7 review (journal, Session 18) found no catch that widens a decision, but it did find a timer that could crash the server, transient database errors returned as bare 500s, errors that change meaning on the way up (a revoked key reported as `server_unavailable`, a database error as `invite_invalid`), provider SDK errors leaking through the guard, and messages without their cause. The question "why not wrap every API call in try/catch?" needs one written answer.
- **Decision:**
  1. **One handler per layer, not try/catch everywhere.** Errors propagate to the layer's single handler: the server's global `HttpExceptionFilter`, the SDK's `HttpClient`, the inbox's `request()`, the CLI's `run()`, and each script's `main().catch`. A local `catch` is allowed only to (a) turn the error into a fail-closed result (block, rejected or expired hold), (b) map one specific, known error to a specific response and rethrow everything else, or (c) finish a best-effort side effect (mail, live events) and log it. A bare `catch {}` that hides an unknown error is a bug.
  2. **A catch never widens a decision.** Any catch on the decision path (sign, check, hold, audit append, outbox) may only produce `block`, a rejected hold or an error; tests cover the failure path. This is the Fail closed rule from `CLAUDE.md`, applied to error handling.
  3. **Status codes:** 400 `validation_failed`; 401 / 403 for authentication and permissions; 404 for unknown resources; 409 for conflicts (unique violations, stale `baseVersion`, a hold that is no longer pending); 429 for rate limits; **503 `database_unavailable` with `Retry-After`** for transient database failures (Prisma `P2024` pool timeout, `P2028` transaction error, `P1001` / `P1017` connection lost, and the driver adapter's connection errors), mapped once in the global filter; 503 `not_ready` from `/health/ready`; 500 `internal_error` only for bugs. Database error mapping lives in one place, not in each service.
  4. **Error bodies** are `{ statusCode, error, requestId? }`, with `error` from an enum; never a message from an exception, a stack or a SQL fragment. 5xx bodies carry the request id, which is also in a response header and in every log line for that request.
  5. **Logging:** 4xx are not logged as errors (sign-in failures are audited instead); 503 is `warn`; 500 is `error` with the exception, route and request id; unhandled rejections and uncaught exceptions are `fatal`, then the process exits 1 and the platform restarts it. Never log tokens, API keys, passwords, cookies or request bodies.
  6. **Errors keep their cause.** Wrapping uses `{ cause }` and the message names it (HTTP status, or a network code such as `ECONNRESET`), so `POST /v1/check failed` becomes `POST /v1/check failed: ECONNRESET`.
  7. **Retries only where repeating is harmless:** JWKS fetch, hold wait (a read), audit batch upload (idempotent on `(planId, clientSeq)`; already retried with backoff). Network errors and 503 are retried with backoff, honoring `Retry-After`; 4xx never. Sign, check, report, approve and reject are never retried by the SDK: a repeated check would count against `maxCalls` twice, and the guard already turns the failure into a block.
  8. **The guard keeps the reason.** Gate errors become blocks with a reason that says what happened: 401 → `api_key_rejected` (unknown or revoked key), other 4xx → `gate_rejected`, network and 5xx → `server_unavailable`; each also emits an `error` event with the cause. A hold wait that fails on the network is an error, not `expired`. LLM failures become a provider-agnostic `ProviderError` (`provider`, `status`, `retryable`) from `@intentlock/guard`, which each adapter maps from its SDK's errors; the run emits an `error` event and keeps the transcript so far.
  9. **The inbox** turns errors into messages in one helper (known codes → a sentence, unknown → a generic sentence plus the code, network → "Can't reach the server"), shows load errors in every component that loads data, and has route error boundaries.
  10. **Lint enforces it:** type-aware `no-floating-promises`, `no-misused-promises`, `only-throw-error` and `use-unknown-in-catch-callback-variable`; a fire-and-forget promise needs an explicit `.catch` that logs.
- **Alternatives:** try/catch in every controller and handler (duplicates the filter, gives inconsistent status codes, and every extra catch is another place to swallow an error on the decision path); `Result` types instead of exceptions throughout (a rewrite of every service for the same outcome); retrying every SDK call (double-counts checks against `maxCalls` and can repeat approvals).
- **Consequences:** `api_key_rejected` and `gate_rejected` are new `ClientBlockReason` values in `@intentlock/core` (a public enum: additive, no existing value changes). `ProviderError` is new public API in `@intentlock/guard`. Clients that matched on 500 for database outages now see 503. The scale test's remote-check burst becomes the acceptance check for points 3 and 7.

### ADR-061: Audit batch ingest: work outside the chain lock, per-plan lock, one append
- **Date:** 2026-10-16 · **Status:** Accepted
- **Context:** The first scale-test runs returned 500s: hybrid batch ingest held the global chain lock (ADR-016, DEPLOYMENT §5.4) for the whole batch, including per-entry token verification, hashing, decision re-checks, report lookups and one insert per entry, so remote checks on every instance queued behind it until Prisma's transaction timeouts fired.
- **Decision:**
  1. Token verification, client-hash checks and the expected decision are computed for every entry before the transaction; none of them reads the database.
  2. The per-plan part (client head, conflicts with stored entries, gaps, chain breaks, reports, `ran` counts, plan completion) runs in the transaction under a per-plan advisory lock (two-key form, namespace `PLAN_LOCK_NAMESPACE` + `hashtext(planId)`, a separate keyspace from the one-key chain lock). Reports find checks from the same batch in memory and earlier ones in the database, matching `findCheckedCall`; a report's `callId` seen earlier in the batch does not increment `ran` twice.
  3. The batch is appended to the global chain once, at the end; `appendIn` inserts all rows with one `createMany`.
  4. Lock order everywhere: row locks and the plan lock first, the chain lock last.
- **Alternatives:** sharded chains with a Merkle anchor (DEPLOYMENT §6.2; the long-term answer, more work than needed now); dropping the per-plan lock and relying on the unique `(planId, clientSeq)` constraint (it still guarantees exactly-once, but a concurrent duplicate then fails with 409 and retries instead of waiting).
- **Consequences:** Local benchmark (ten 99-entry batches uploaded at once plus 40 concurrent remote checks, same machine and test database, 3 rounds): old ~10.5 s per round with 39–40/40 remote checks failing and about a quarter of each round's entries left for retry; new ~3.1–3.7 s with 0–9/40 failing and every entry stored. The remaining failures are pool limits (Phase 5.7 pool task). Flags, idempotency and the chain are unchanged (existing hybrid e2e suite plus a concurrent duplicate-batch test).

### ADR-062: Manual, lockstep versioning of the MIT packages
- **Date:** 2026-10-16 · **Status:** Accepted
- **Context:** Phase 6 asks for "Changesets or manual versioning" and a first npm release of `@intentlock/core`, `sdk`, `guard` and `anthropic` at `0.1.0`. They depend on each other (`anthropic` → `guard` → `sdk` → `core`) and change together.
- **Decision:** Manual versioning: the four packages always carry the same version and are published together with `pnpm -r publish` (CONTRIBUTING "Releasing"). pnpm turns `workspace:*` into the exact sibling version and `catalog:` into the catalog range at publish time. Each manifest has `publishConfig.access: public` (scoped packages are private by default), `repository`/`homepage`/`bugs`, `engines.node >=22`, and a `prepack` build. Server and inbox are never published to npm; their versions are Docker tags (`vX.Y.Z` git tag → `X.Y.Z` image).
- **Alternatives:** Changesets (a new dev dependency and a release PR flow, worth it once the packages version independently or there are outside contributors); independent versions (more bookkeeping for no gain while they move together).
- **Consequences:** A breaking change in one package bumps all four. Checked before the first publish: `pnpm pack` of each package contains only `dist/`, `README.md`, `LICENSE`; the tarballs installed into an empty project (offline, from the local store) run a guarded tool call with `LocalGate` and `FakeProvider` and block an off-plan call.

### ADR-063: Vercel functions in Singapore (`sin1`)
- **Date:** 2026-10-17 · **Status:** Accepted
- **Context:** Phase 6.5 measurements: the inbox's page payloads (`?_rsc`) ran in Vercel's default region `iad1` (Washington), while Render and Neon are in Singapore and the users are in India; a page switch that needs a payload waited 350–480 ms for it before its API requests started.
- **Decision:** `apps/inbox/vercel.json` sets `"regions": ["sin1"]`, next to Render and Neon and ~60 ms from Mumbai. The file is versioned, so the region does not depend on a dashboard setting.
- **Alternatives:** `bom1` (closest to today's users, but ~60 ms from the server for any server-side fetch later); the dashboard setting only (not visible in the repo).
- **Consequences:** Self-hosted deployments are unaffected. Another team picks the region next to its Render and Neon regions (DEPLOYMENT §9).
