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
- **Date:** 2026-10-11 · **Status:** Accepted · Amended by ADR-024 (Community also limited to 3 agents; `maxAgents` enforced) · Editions and feature flags superseded by ADR-082
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
  5. **Planner:** `declare_plan` has a hand-written, flat JSON schema (tool names as an `enum`, one constraint object with optional `eq | in | glob | lte | gte`), because zod's generated schema for core's `ArgConstraint` uses `$ref`/`$defs` and a recursive JSON type that free models handle poorly. The result is validated with core `Plan` (strict: two keys in one constraint fails) plus a known-tool check. The planner's prompt carries the task and each tool's name, description and argument names (type, optional or not; added 2026-10-19 so pins use real argument names), never tool output or the policy; the only tool offered is `declare_plan`. Exactly one call and no other calls, else retry once, then `PlannerError` (no plan signed, `error` event).
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

### ADR-064: TanStack Query for inbox data
- **Date:** 2026-10-17 · **Status:** Accepted
- **Context:** Phase 6.5 measurements: every API request from the inbox costs ~240 ms, almost all of it network, and `useApi` kept no cache, so every page switch refetched everything from zero behind skeletons (`/v1/agents` on almost every page). We need a shared cache, background refresh, request deduplication, invalidation from socket events and mutations, and a retry rule.
- **Decision:** `@tanstack/react-query` v5 is a new runtime dependency of `apps/inbox` only (Abdullah asked for it). One `QueryClient` per browser tab (`getQueryClient()`; a fresh one per server render, so nothing is shared between users). `useApi(url, schema)` keeps its signature and becomes a thin `useQuery` wrapper:
  1. The query key is `["api", path, search]`, from the URL `apiUrl()` builds, so the endpoint and its params decide the key and a path prefix invalidates every query string of an endpoint.
  2. The cache holds the raw JSON; each component's zod schema runs in `select`, so two components that read the same URL with different schemas (`AgentSummaries`, `AgentViews`) share one request and both stay validated. A response that does not match is an `ApiError` `unexpected_response`, as before.
  3. `staleTime` 5 s: a page you come back to shows its cached data at once and refreshes it in the background, while a hover prefetch followed by a click is not fetched twice; the previous data stays on screen while the URL changes (`keepPreviousData`), so filters do not flash skeletons.
  4. Retries follow ADR-060 §7 (queries are reads): none on 4xx, up to 3 with exponential backoff (1 s, 2 s, 4 s) on network errors and 5xx. `Retry-After` is not read; the backoff covers the server's 2 s.
  5. The cache is cleared on sign-out and on any 401 from a query, before the redirect to `/login`.
  6. Live updates: `useLiveQueries()` in the app shell maps each socket event to the endpoints it changes (`EVENT_QUERY_PATHS`) and invalidates those queries (every query string, and sub-paths such as `/v1/runs/:planId`); a reconnect invalidates all of them. The polling fallback for hosts without WebSockets is `refetchInterval` (holds 10 s, latest activity 15 s, onboarding 3 s), which pauses while the tab is in the background.
  7. Mutations: a successful non-GET `api()` call invalidates every cached query; only the queries on screen refetch, the rest are refetched when next shown. Read-only POSTs (policy test, invite lookup) and sign-out are skipped. `reload()` joins a refetch already in flight instead of starting a second one. Mapping each mutation to the exact keys it changes is not worth it at a handful of writes per session.
  8. Prefetch: hovering or focusing a sidebar link prefetches that page's first-render requests (`pageQueryUrls`, same URLs as the components build); data younger than `staleTime` is not fetched again. The Overview's stats window is rounded down to 5 minutes (`statsWindow`), otherwise its `from` changes every millisecond and the stats would never come from the cache.
- **Alternatives:** SWR (smaller, but mutations, invalidation by key prefix and retry predicates are thinner); a hand-written cache in `useApi` (the same features rebuilt and maintained by us); server components with fetches on Vercel (every page switch would still wait for a function, ADR-063 numbers).
- **Consequences:** ~13 kB gzipped added to the inbox bundle. Components keep calling `useApi`; socket-driven invalidation, mutations and prefetch go through the same query client (points 6–8).

### ADR-065: Keep Render awake with an external monitor on `/health`; accept Neon's cold start
- **Date:** 2026-10-17 · **Status:** Accepted
- **Context:** On the free hosting (DEPLOYMENT §9) Render spins the server down after 15 minutes without inbound traffic and needs ~1 minute to wake; Neon suspends compute after 5 idle minutes (not configurable on the free plan) and its first queries then take ~0.9–1 s (Phase 6.5 numbers). Free limits checked 2026-10-17: Render 750 instance hours per workspace per month, spun-down services use none; Neon 100 CU-hours per project per month, compute suspended when they run out; GitHub Actions 2,000 minutes per month for a private repo, each job rounded up to a whole minute.
- **Decision:** A free external HTTP monitor (UptimeRobot or cron-job.org) sends `GET /health` to the Render URL every 5 minutes. `/health` does not query the database, so Neon keeps scaling to zero. The cold start that remains is Neon's (~1 s on the first request after 5 quiet minutes), which we accept for the demo.
- **Alternatives:** a GitHub Actions `schedule` ping (3,000–4,500 runs a month in a private repo, more than the 2,000 free minutes together with CI, and scheduled runs are often delayed past 15 minutes); pinging `/health/ready` (wakes Neon every time: at a 10-minute interval Neon would be up about half the time, ~93 of 100 CU-hours, and an always-awake database needs ~186); accepting both cold starts (a 1-minute first page after every quiet quarter hour); paid Render or Neon (not for v0.1).
- **Consequences:** No code in the repo; the monitor is a manual step (DEPLOYMENT §9.1 step 11). The always-on server uses ~744 of 750 free Render hours, so the workspace has room for no other free service. If the monitor stops, the 1-minute wake-up comes back but nothing breaks.

### ADR-066: Public website as a separate Astro + Starlight app (`apps/site`)
- **Date:** 2026-10-17 · **Status:** Accepted
- **Context:** Phase 6.6: visitors need a landing page that explains Intentlock and the user documentation. The first plan put both in the inbox, public only behind an env flag; that needs an exception to "nothing in the inbox is visible without signing in" (PRD, ARCHITECTURE §5.6), proxy rewrites, a docs framework that fits Next 16 with `typedRoutes`, `reactCompiler` and `output: "standalone"`, and a search route outside the `/api/*` rewrite. The inbox also cannot be built locally (fonts download), so every check waits for a Vercel preview.
- **Decision:**
  1. A separate static site in `apps/site` (`@intentlock/site`, private, ELv2 under the root `LICENSE`): the landing page at `/` and the docs at `/docs`, built with Astro and Starlight. The inbox does not change and stays fully private; there is no public-site flag.
  2. New dependencies, `apps/site` only: `astro@7.4.0`, `@astrojs/starlight@0.42.6`, `@tailwindcss/vite@4.3.3` (with the catalog's `tailwindcss`), dev `@astrojs/check@0.9.10` (type-checks `.astro` files). Versions checked on 2026-10-17. Astro 7 needs Node ≥ 22.22 (the Vercel project uses Node 24). No image optimisation (`passthroughImageService`): the art is CSS and inline SVG, so `sharp` is never used.
  3. Static output only: plain HTML and CSS, no client JavaScript on the landing page (Starlight adds its own small scripts for search and the theme toggle on `/docs`). Search is Pagefind, built at build time, so there is no search endpoint.
  4. The theme uses the same tokens as `@intentlock/ui` (light and dark), mapped to Starlight's `data-theme` attribute, so the site and the inbox look like one product.
  5. Removable: no package or app imports `apps/site`; it is in no Docker image, the self-host bundle or the release job. Turbo and pnpm find it by the `apps/*` glob, so deleting the folder needs no other edit.
  6. Sign in links go to `INBOX_URL` (build time); when it is unset the links are left out.
  7. One source of truth: user-facing docs live in the site (`apps/site/src/content/docs/`). `docs/USAGE.md` moves there and is replaced by a pointer; the environment variable reference moves to the site's deployment page and DEPLOYMENT §2 points to that file. DEPLOYMENT keeps the engineering parts (topology, scaling, our instance), the root `docs/` keeps PRD, ARCHITECTURE, PLAN and the rest.
- **Alternatives:** inside the inbox behind `INTENTLOCK_PUBLIC_SITE` (built and reverted the same day: an exception to the sign-in rule and proxy rewrites, for pages that hold no team data); Fumadocs in a separate Next.js app (React runtime on static pages, Google fonts at build, so still no local build); Docusaurus (heavier, its own styling system); VitePress (Vue, so the landing components would not port).
- **Consequences:** A second Vercel project. A new framework in the repo, used by one app. ESLint covers the site's `.ts` files only, and Prettier does not format `.astro` files (each would need another plugin; not added). The site can be built and previewed locally.

### ADR-067: Geist Sans and Geist Mono for the public site, self-hosted through Fontsource
- **Date:** 2026-10-18 · **Status:** Accepted
- **Context:** Abdullah asked for the landing page to match his reference more closely, in Geist Sans and Geist Mono. The site must stay buildable offline (ADR-066), so no font request to Google at build or in the browser.
- **Decision:** `@fontsource-variable/geist@5.3.0` and `@fontsource-variable/geist-mono@5.3.0` in `apps/site` only (Abdullah approved; ~350 kB unpacked together). Imported once in `apps/site/src/styles/palette.css`, which both the landing page and the Starlight docs use; the `.woff2` files are bundled by Astro and served from the site's own origin. The same file sets the site's neutral palette (white, pure greys) on top of the `@intentlock/ui` tokens. The inbox keeps Inter and its warm palette.
- **Alternatives:** the `geist` package (built for `next/font`); Google Fonts (a request to Google from every visitor, and a download at build); system fonts (did not match the reference).
- **Consequences:** The site and the inbox use different fonts. Variable fonts mean one file per family and subset, all weights included.

### ADR-068: Docs code blocks and drift checks
- **Date:** 2026-10-18 · **Status:** Accepted · Details ADR-066 point 7
- **Context:** The Starlight docs need code blocks that match the landing page (Abdullah: syntax colours from the `--code-*` tokens, no scrollbars on code blocks), and the docs must not drift from the packages, the API or each other once USAGE and the env reference move into the site.
- **Decision:**
  1. Starlight's Expressive Code is off (`expressiveCode: false`). Markdown code blocks use Astro's own Shiki with `theme: "css-variables"` and `wrap: true`, the same as the landing page's `<Code>`; the `--astro-code-*` → `--code-*` mapping lives once in `palette.css`.
  2. `apps/site/test/unit/content/docs.test.ts` (Vitest, part of `pnpm test`): every `ts` code block is compiled with the TypeScript compiler API against the built packages (strict, one module per block, ambient values such as `github` or `provider` declared in `test/fixtures/docs-prelude.d.ts`); every internal `/docs/...` link must point at a page and, with `#anchor`, at a heading on it; every `API_ENDPOINTS` path must appear on the HTTP API page.
  3. `@intentlock/core`, `sdk`, `guard`, `anthropic` (workspace), `zod` and `@types/node` (catalog) are dev dependencies of the site for that test only. No new third-party packages.
  4. Besides USAGE and DEPLOYMENT §2, the generic free-hosting steps (DEPLOYMENT §9.1) and the self-host install (§10) move to the site's deployment pages; DEPLOYMENT keeps our instance's differences, the topology and the bundle internals.
- **Alternatives:** Expressive Code with a custom theme (needs real colours to compute contrast, so the light/dark tokens would be duplicated, and it adds client JS for the copy button); checking links in the built `dist/` (needs a build in the test); type-checking samples with a remark plugin at build time (slower builds, errors far from the test runner).
- **Consequences:** Code blocks have no copy button or file-name frames. `turbo build` of the site now builds the four MIT packages first. Samples must be complete enough to compile, using only the prelude's ambient names; `json`, `yaml`, `bash` and `txt` blocks are not checked.

### ADR-069: Host the public website on Cloudflare Workers static assets
- **Date:** 2026-10-18 · **Status:** Accepted · Supersedes ADR-066's "second Vercel project" consequence
- **Context:** Abdullah chose Cloudflare for `apps/site`. The site is fully static (`dist/`), Astro needs Node ≥ 22.12, and the repo is a pnpm workspace (pnpm ≥ 10.26). Cloudflare's Astro guide (checked 2026-10-18) deploys a static Astro site as a Worker with static assets and no adapter; Workers Builds defaults to Node 24.18 and pnpm 10.11.1.
- **Decision:**
  1. `apps/site/wrangler.jsonc`: `name: intentlock-site`, `assets.directory: ./dist`, `not_found_handling: 404-page`, no `main` (no Worker code) and no `@astrojs/cloudflare` adapter.
  2. Built and deployed by Git-connected Workers Builds from the repo root: build `pnpm turbo run build --filter=@intentlock/site`, deploy `npx wrangler deploy --config apps/site/wrangler.jsonc`, branch builds `npx wrangler versions upload --config apps/site/wrangler.jsonc`. Build variables `PNPM_VERSION=10.34.6`, `NODE_VERSION=24`, `SITE_URL`, `INBOX_URL`.
  3. Wrangler is not a repo dependency: Workers Builds runs it with `npx`, and nothing deploys from a laptop.
  4. The inbox shows a "Docs" link in the sidebar when `NEXT_PUBLIC_DOCS_URL` (an http(s) URL, inlined at build) is set; self-hosted builds leave it unset and the link is hidden.
- **Alternatives:** Cloudflare Pages (works, but Cloudflare's current Astro guide targets Workers static assets and Pages gets no new features); a second Vercel project (the original plan; Abdullah chose Cloudflare); adding `wrangler` as a dev dependency for local `wrangler dev` (`astro preview` already serves `dist/`).
- **Consequences:** One more config file in `apps/site` (deleted with the folder). The Workers Builds install runs at the repo root and installs the whole workspace. Static asset requests on Workers are free; limits are checked before deploying and noted in the journal.

### ADR-070: MCP proxy with a plan file and return-and-retry holds
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** MCP clients (Claude Desktop, Cursor, Claude Code) call tools in long sessions that span many tasks and never send a task, so the guard's planner has nothing to plan from. MCP clients also time out a tool call after about 60 seconds, while a hold can wait minutes. Abdullah chose a plan file and return-and-retry holds.
- **Decision:**
  1. `packages/mcp-proxy` (`@intentlock/mcp-proxy`, ELv2, bin `intentlock-mcp`) depends on `@intentlock/sdk`, `@intentlock/core`, `@modelcontextprotocol/sdk` (already listed in ARCHITECTURE; 1.32.1 was in the local store, installed offline) and zod. It speaks stdio to the client and spawns the upstream server over stdio: `intentlock-mcp --plan plan.json -- <upstream command…>`.
  2. **Plan file, required.** JSON with `goal` and `steps` (the core plan step format); `user` comes from `--user` or `INTENTLOCK_USER`. The proxy signs it through `HybridGate` at startup. Without a file there is no useful default: a plan holds at most 50 steps and the GitHub MCP server alone has more tools. `--list-tools` prints the upstream tools and exits, to help write the file.
  3. **Only planned tools are listed.** `tools/list` returns the upstream tools named in the plan; the rest are hidden, so the model does not try them. A call to any other tool is still blocked (`not_in_plan`).
  4. **Long sessions.** An expired token is refreshed once (same plan hash). If refresh fails (idle for over an hour), the proxy signs the same plan file again; this is not widening because the file, not the model, defines the plan. A new plan starts new `maxCalls` counters.
  5. **Holds return and retry.** A held call returns at once with an error result telling the model to ask the user to approve in the inbox and call again. The proxy remembers the hold by the call's canonical JSON (tool + arguments). A repeat of the same call checks the hold: approved → runs upstream; rejected → blocked; still pending → the same message; expired → checked again as a new call. A different call never matches an approval.
  6. Allowed calls are forwarded unchanged; the outcome (`ok`, or `error` when the upstream result has `isError`) is reported. Blocked calls return an MCP error result with the rule id or reason. Gate failures block (fail closed).
  7. v1 proxies tools only: resources, prompts and sampling are not exposed. stdout carries only MCP messages; logs go to stderr. The hybrid outbox defaults to `~/.intentlock/outbox` (`INTENTLOCK_OUTBOX_DIR`), since MCP clients start the proxy from an unpredictable working directory.
- **Alternatives:** a model-declared plan through an `intentlock_declare_plan` tool (in a long chat the model may already have read untrusted text, and a second declaration widens mid-session); waiting on holds with progress notifications (only some clients reset their timeout on progress); every upstream tool in the plan when no file is given (over 50 tools for common servers, and the plan layer would do nothing).
- **Consequences:** Someone writes a plan file per MCP setup; `--list-tools` and a docs page make that quick. A held call needs the model to call again after approval. `maxCalls` limits apply per signed plan, not per chat.

### ADR-071: Publish the MCP proxy to npm
- **Date:** 2026-10-19 · **Status:** Accepted · Amends ADR-021 ("only MIT packages are published") and ADR-062 (four packages)
- **Context:** MCP clients start servers with a command line, and the usual one is `npx -y <package>`. Building the proxy from a clone is a real barrier for the people it is for. Abdullah decided to publish it like the other packages.
- **Decision:**
  1. `@intentlock/mcp-proxy` is public on npm under the Elastic License 2.0. The tarball carries its own `LICENSE` (the ELv2 text from the root `LICENSE`), since the root file is not packed.
  2. It joins the lockstep release (ADR-062): the five published packages share one version and `scripts/release.ts` publishes all of them. It ships from the next release (0.1.0 is already tagged).
  3. It stays a separate package from the MIT ones: it depends on `@intentlock/sdk` and `@intentlock/core`, nothing MIT depends on it, and no server or inbox code is copied into it.
- **Alternatives:** keep it private and document a clone build (friction at the first step); make it MIT (the proxy is a product surface, like the CLI, not an SDK teams embed).
- **Consequences:** ELv2 allows using and running the proxy, including in companies; it forbids offering it as a managed service. The npm page states the license. A breaking change in the proxy bumps all five packages.

### ADR-072: Hold notifications by email and an optional webhook
- **Date:** 2026-10-20 · **Status:** Accepted
- **Context:** A hold today shows up only in an inbox that someone has open. The first triage-bot runs showed that a held comment can expire before anyone sees it. Early user 1 asked to be told about new holds.
- **Decision:**
  1. **Who gets the email.** When a hold is created, the server emails every active team member that `canApprove(spec, member, requester)` accepts. These are the members the hold's approver spec covers by role, by email, or as the requester when `self: true`. Emails in the spec that do not belong to a member are skipped, because those people cannot sign in to approve.
  2. **Channels.** Email goes through the existing `MailService` (`SMTP_URL`, `SMTP_FROM`) and is skipped when SMTP is not set. There is also an optional `HOLD_WEBHOOK_URL` env var (https only, one per deployment, which means one per organization under single tenancy). It receives `{ "text": ..., "content": ... }`, which works with both Slack incoming webhooks (`text`) and Discord webhooks (`content`). Both channels run independently.
  3. **When.** Notifications are sent only after the hold transaction commits, from the same place as `announceCreated`. This covers both the remote check path and hybrid `createForAgent`. Hybrid currently emits no `hold.created` event, and this change fixes that too. Sending runs in the background: it is started but not awaited, so the hold response and the app never wait on it. Each email or webhook call that fails is retried once after 5 s, and each webhook call has a 5 s timeout. There is no queue. If the instance dies mid-send, that notification is lost, but the hold is still in the inbox. Only the instance that created the hold sends, so a multi-instance setup sends no duplicates.
  4. **Failures.** An email or webhook that still fails after its retry is logged and appended to the audit chain as `hold_notify_failed` (hold id, channel, and the recipient address for email; the error goes to the log). A failure never changes the hold or the decision. Fail closed applies to the tool call, not to the notification. Successful sends are not audited, to keep the chain free of noise.
  5. **Opt-out.** Each user has a `holdEmails` boolean (default `true`) that they toggle on the Account page. Turning it off stops the emails but leaves approval rights unchanged. The webhook has no per-user opt-out; an admin removes the env var.
  6. **Content.** Each notification has agent name, person (`user`), tool, rule id, expiry time and a link to `<PUBLIC_URL>/holds`. Email also includes the arguments as compact JSON, cut to 500 characters. Every recipient is already allowed to see those arguments in the inbox (ARCHITECTURE "Sensitive arguments"). The webhook includes only the argument *names*, never their values, because a Slack or Discord channel is not limited to approvers. Per-tool redaction is still the later paid `arg_redaction` feature.
- **Alternatives:** awaiting the send before responding (it would make holds slow and make them depend on SMTP); a persistent retry queue (an in-memory one breaks the stateless rule; a DB queue plus a worker is too much for a notification that one retry covers); a webhook per user (no one asked for it); a webhook that carries argument values (leaks to the whole channel); digest emails (a hold can time out in minutes).
- **Consequences:** One migration (`User.holdEmails`). One new env var (`HOLD_WEBHOOK_URL`). One new audit kind. No new runtime dependency, because the webhook uses `fetch`. On Render's free tier, outbound SMTP ports 25, 465 and 587 are blocked (since 2025-09), so mail there needs a provider that listens on port 2525, such as Brevo's `smtp-relay.brevo.com:2525`. The webhook needs no extra port, because it runs over HTTPS on 443.

### ADR-073: Member labels for display only
- **Date:** 2026-10-20 · **Status:** Accepted
- **Context:** Early user 1 runs a triage bot as a team member. In Team, Activity and holds it looks like any other person, so admins want to mark it, for example as `bot`.
- **Decision:**
  1. **Storage.** `User.label String?`, added by one migration. `null` means no label.
  2. **Format.** zod: trimmed, 1–24 characters from `^[A-Za-z0-9][A-Za-z0-9 _.-]*$`. `null` (or an empty string) clears it. One label per member; it is not a list.
  3. **Route.** No new route. The existing admin-only `PATCH /v1/users/:email` (`API_ENDPOINTS.USER`) accepts an optional `label`. The change is audited as `user_updated` with the old and new label, like role and group changes. `GET /v1/users` returns `label` to everyone, as it already returns role and groups.
  4. **Never a policy input.** The label is not part of the plan, the signed token, the policy `match` fields or `canApprove`. Groups remain what policies match on. A test checks that changing a label leaves the decision for the same call unchanged.
  5. **Display.** The inbox shows the label as a small badge next to the person's email in Team, Activity, holds and run details. It looks labels up from the cached `GET /v1/users` list, so audit, hold and run responses stay unchanged. A person who is not a member (for example a removed one) shows no badge.
- **Alternatives:** reuse a group such as `bot` (groups change policy decisions, which is exactly what a display label must not do); a fixed `isBot` flag (too narrow, since teams may want labels like `contractor` or `ci`); several labels per member (nobody needs them yet); adding the label to every audit and hold row (larger responses and a second copy that can go stale).
- **Consequences:** One migration and an optional field on one existing route; no new route and no change to the audit chain. Labels are visible to every signed-in member, like groups.

### ADR-074: Numbered pages for Activity
- **Date:** 2026-10-20 · **Status:** Accepted (Abdullah chose numbered pages over next/previous only)
- **Context:** Activity used "Load more" over a `seq` cursor. Early user 1 wants pages they can jump between and share, and wants a page to survive a reload. Numbered pages need a total count and offset paging, which get slower as the audit table grows. The cursor stays fast but can't jump to page 7.
- **Decision:**
  1. `GET /v1/audit` takes an optional `page` (1-based, at most 10,000) next to `limit` (1–200, as before). With `page`, the server skips `(page − 1) × limit` rows in `seq desc` order and also returns `total`, counted with the same filters and the same member scoping. Without `page`, the cursor behaviour is unchanged (`nextCursor`), so the CLI, the overview and other clients keep working.
  2. The response with `page` is `{ entries, total, page, nextCursor: null }`.
  3. Inbox: Activity shows page numbers (first, last and the pages around the current one), previous/next, a page size of 25, 50 or 100, and "x–y of N". `page` and `size` live in the URL next to the existing filters, so the link can be shared and the page survives a reload. Applying filters goes back to page 1. Changing pages keeps the previous rows visible, dimmed, until the next page loads.
- **Alternatives:** keyset next/previous with no total (stays fast at any size but can't jump or show "of N"); keyset with an estimated count from `pg_class` (a wrong-looking total confuses people); keeping "Load more" (no shareable position).
- **Consequences:** Each page runs two queries: a count and an offset fetch. Both use the existing `orgId` indexes. This is fine for a team's audit log up to a few hundred thousand rows. The ceiling is deep pages on an unfiltered log with millions of rows. When that becomes a problem, switch to keyset pages with an estimated total; the cursor path is still there for that.

### ADR-075: Deleting an agent archives it
- **Date:** 2026-10-20 · **Status:** Accepted (Abdullah, including rejecting pending holds)
- **Context:** `DELETE /v1/agents/:id` only sets `disabledAt`, and the inbox has no button for it. Disabled agents already don't count against `maxAgents` (`LicenseService.countActive` skips them), but a disabled agent still sits in every list and filter, keeps its API keys and blocks its name. A real row delete is not possible: audit entries keep `agentId` inside the hash chain, `PolicyVersion` rows are never deleted, and plans, runs and holds point at the agent.
- **Decision:**
  1. **Archive, not delete.** New column `Agent.deletedAt DateTime?` (one migration). "Delete" sets it. It is one-way; there is no restore. Disable/enable stays as the reversible switch.
  2. **Route.** `DELETE /v1/agents/:id` (`API_ENDPOINTS.AGENT`, already there) changes meaning from "disable" to "delete": admin only, returns `204`, `404` if the agent is unknown or already deleted. One transaction: set `deletedAt`, revoke every active API key (`revokedAt = now`), reject every pending hold of the agent with the note "agent deleted" (the same `WHERE status = 'PENDING'` guard, one `hold_resolved` audit entry each, the admin as actor), and append one `agent_deleted` audit entry with the name.
  3. **It stops working.** Revoked keys fail the API-key guard. Plan signing refuses a deleted agent like a disabled one (`agent_disabled`, so clients need no new error code). Tokens already signed die at their next check because the key is revoked.
  4. **License.** `countActive` counts `disabledAt IS NULL AND deletedAt IS NULL`.
  5. **Name reuse.** `@@unique([orgId, name])` becomes a partial unique index over rows where `deletedAt IS NULL`, using Prisma 7.10's `partialIndexes` preview feature (`@@unique([orgId, name], where: { deletedAt: null })`), so the old row keeps its name for history. If the preview feature misbehaves in `migrate dev`, the fallback is a hand-written partial index in the migration SQL.
  6. **Lists and history.** `GET /v1/agents` leaves deleted agents out; `?includeDeleted=true` adds them (with `deletedAt`). The Agents page uses the default. The inbox fetches the list once with `includeDeleted=true`: agent filters drop deleted agents, and the name lookup (Activity, holds, overview) shows them as "name (deleted)". Runs already resolve names by id on the server. `GET /v1/agents/:id` still returns a deleted agent (Overview and Activity tabs only); PATCH and every policy and API-key route answer `404 agent_not_found`, so a deleted agent's policy history is no longer shown in the inbox (the rows stay in the database and the audit log).
  7. **Inbox.** A "Delete agent" button on the agent page (admin only) opens an `AlertDialog` that asks the admin to type the agent's name; it says keys will be revoked and pending holds rejected. This uses the dialog from the next round-2 item, so the button lands with that item if the dialog isn't in `@intentlock/ui` yet.
- **Alternatives:** a real delete with `ON DELETE SET NULL` (breaks policy-version history and run views; chain still verifies but loses meaning); renaming the deleted row (for example `name~id`) to free the name (no preview feature, but history shows a mangled name); leaving pending holds to time out (they would sit in the inbox for an agent that no longer exists); a restore action (no one asked, and a reused name would conflict).
- **Consequences:** One migration (column + index swap) and one preview feature flag. `DELETE /v1/agents/:id` changes meaning and status code, and `GET /v1/agents` gains `includeDeleted` plus a `deletedAt` field: both are public API changes. New audit kind `agent_deleted`. The audit chain is untouched.

### ADR-076: Hold search, filters and bulk resolve
- **Date:** 2026-10-20 · **Status:** Accepted (Abdullah)
- **Context:** Early user 1 had 176 pending holds in a seeded inbox and could only approve or reject them one card at a time, with no way to find a hold by tool, person or argument. `GET /v1/holds?status=` already returns up to 200 holds (newest first), filtered by role, and the inbox polls it every 10 s.
- **Decision:**
  1. **Search and filters in the inbox, no server change.** The Holds page filters the loaded list on the client: free text over tool, agent name, person, rule id and the arguments as JSON (case-insensitive), an agent filter, and a state filter (pending, approved, rejected, expired) that maps to the existing `status` query. `q`, `agent` and `state` live in the URL. Ceiling: 200 holds per state; past that, add `q`/`agentId`/paging to `GET /v1/holds`.
  2. **Bulk resolve is one route.** `POST /v1/holds/resolve` (`API_ENDPOINTS.HOLDS_RESOLVE`, session only, any role) with `{ ids: string[] (1–100, unique), approve: boolean, note?: string }` → `{ results: { id, outcome }[], resolved, skipped }`. `outcome` is a new enum: `approved`, `rejected`, `expired`, `not_pending`, `not_an_approver`, `not_found`.
  3. **Each hold still resolves on its own, in one set-based pass.** One query loads the holds; the approver check (separation of duties, `self` rules) runs per hold in memory. One transaction then runs a single `UPDATE … WHERE id = ANY(allowed) AND status = 'PENDING' AND expiresAt > now RETURNING …` (the same per-row guard as single resolve) and one audit append with one `hold_resolved` entry per updated hold, so the chain lock is taken once. A `hold.resolved` event goes out for each. Ids that were missing, not the caller's to approve, already resolved or expired get that outcome and never affect the rest. The approver is always the signed-in user. About four queries per batch whatever its size. Calling single resolve per id was rejected: in sequence it is ~5 queries per hold, and in parallel (`Promise.all`) 100 transactions would queue on the chain lock while holding pool connections (pool 10, 2 s wait) and fail.
  4. **Inbox.** A checkbox per pending hold the user may approve, "select all on this page" (the filtered list), and a bar with Approve, Reject and an optional note. Reject is confirmed in the `ConfirmDialog`; approve is not, as single approve isn't. The result is a toast: "Approved 12, skipped 3 (2 expired, 1 already resolved)".
- **Alternatives:** the inbox calling `approve`/`reject` once per hold (no API change, but up to 100 requests from the browser on Render's free tier, and a dropped connection mid-way leaves the user unsure what was resolved); calling the single-hold `resolve()` per id, in sequence or with `Promise.all` (see 3); server-side search now (not needed under 200 holds).
- **Consequences:** One new route in `API_ENDPOINTS` and one new enum for outcomes: a public API addition. No migration. A batch of any size is one read and one short transaction.

### ADR-077: shadcn chart component for the Overview charts
- **Date:** 2026-10-20 · **Status:** Accepted (Abdullah)
- **Context:** The Overview charts (`verdict-chart`, `kpi-panel` sparklines) use Recharts directly with hand-written tooltips and colours. "Decision volume" shows one total bar per bucket, so you can't see how many were blocked. Two options were compared: the shadcn `chart` component and Evil Charts (github.com/legions-developer/evilcharts, a shadcn-style registry).
- **Findings:**
  - shadcn `chart`: MIT (like the shadcn components already in `@intentlock/ui`). Built on Recharts only. Adds `ChartContainer` (colours from CSS variables, so light and dark work), `ChartTooltip`/`ChartTooltipContent` and `ChartLegend`/`ChartLegendContent`.
  - Evil Charts: MIT (repo About). Charts are copied in from its registry. The project depends on `echarts` and `motion` besides Recharts, so some charts would bring a new dependency. It builds on the same shadcn `chart` component, adding visual styles (glows, gradients, animated patterns) we don't need for four small charts.
- **Decision:**
  1. Use the shadcn `chart` component, written by hand into `packages/ui/src/components/chart.tsx` (no registry download). `recharts` moves to `@intentlock/ui`'s dependencies at the version the inbox already uses (3.10.1, already in the pnpm store, so nothing new is installed). Evil Charts is not used. Its look (a gradient area, rounded stacked bars) is a few lines of Recharts if we want it later.
  2. Charts only where they answer a question:
     - **Decisions over time by verdict:** "Decision volume" becomes stacked bars (allowed, blocked, held) with a legend and one tooltip listing all three. The data is already in `GET /v1/stats/overview` (`series`).
     - **Top blocked tools:** stays the ranked list with bars it is today (a table answers "which tool" better than a chart); no change.
     - **Hold outcomes:** a one-row stacked bar of approved, rejected and expired holds resolved in the range, with counts and shares under it. This needs `holdOutcomes: { approved, rejected, expired }` added to `GET /v1/stats/overview`, one `groupBy` on `Hold` with the same range, agent and role scoping (an additive public API change).
     - **Time to approve:** keep the median tile (it already exists); no distribution chart, since nobody has asked which hold took long.
  3. The KPI sparklines move onto `ChartContainer` for theme colours; they stay sparklines.
- **Alternatives:** Evil Charts (more style than we need, possible `echarts`/`motion` dependencies, a second registry to track); keeping raw Recharts (each chart keeps its own tooltip and colour code); a time-to-approve histogram (no question asks for it yet).
- **Consequences:** No new package. `recharts` is declared in `@intentlock/ui` too. One additive field on the stats endpoint for hold outcomes; no migration. The shadcn code is MIT inside an ELv2 package, the same as the existing shadcn components.

### ADR-078: Audit page with a chain summary and a recorded verify
- **Date:** 2026-10-20 · **Status:** Accepted (Abdullah)
- **Context:** The Audit page was one "Verify now" button. It is where the tamper-evidence promise is shown, so it should say how big the chain is, where its head is, when it was last checked and by whom, and how to check it without trusting the server. The alternative was a "Verify chain" panel inside Activity with the Audit nav item removed.
- **Decision:**
  1. Keep Audit as its own page: a chain summary, the verify panel, and (admins and approvers) Export chain plus the exact `intentlock audit verify --file intentlock-audit.jsonl` command. Members don't get the export panel because their export holds only their own runs and is not a whole chain.
  2. New route `GET /v1/audit/summary` (`API_ENDPOINTS.AUDIT_SUMMARY`, any signed-in user) → `{ count, head: { seq, hash, at } | null, oldest: { seq, at } | null, retentionDays, lastVerified: { seq, at, email, ok, count, firstBrokenSeq? } | null }`. Like verify, it reads the single global chain unscoped. `retentionDays` comes from the license; nothing is purged yet, and the page says so.
  3. Every `GET /v1/audit/verify` appends an `audit_verified` entry (`actor` = user id, payload `{ email, ok, count, firstBrokenSeq? }`). "Last verified" is the newest such entry, so the record of who checked the chain is itself in the chain. No migration.
  4. Each flagged entry in the verify result also carries `planId`; the inbox links it to `/runs/:planId`.
- **Alternatives:** Fold into Activity (smaller, but hides the promise); storing the last verify in a new table (needs a migration and is not tamper-evident); building the page from `GET /v1/audit?page=1&limit=1` (no oldest entry and no clean way to find the last verify).
- **Consequences:** Verify now writes, although it is a GET. The last-verify lookup filters on `kind`, which has no index; it walks back from the head and is cheap while verifies are frequent, but scans the table when there has never been one. Add an index on `kind` if that shows up.

### ADR-079: Publish the CLI to npm
- **Date:** 2026-10-20 · **Status:** Accepted (Abdullah) · Amends ADR-021 and ADR-071
- **Context:** The docs use `intentlock` commands (keygen in the self-host guide, policy validate/test/push, audit verify, and now the Audit page), but the CLI was `private` and could only be built and linked from a clone. A self-hoster running the Docker images had to clone the monorepo just to create a signing key, and an auditor had to do the same to check an export.
- **Decision:**
  1. `@intentlock/cli` is public on npm under the Elastic License 2.0, with its own copy of the ELv2 `LICENSE` in the tarball, the same as `mcp-proxy` (ADR-071). The binary stays `intentlock`.
  2. It joins the lockstep release: six packages share one version and `scripts/release.ts` publishes all of them. It ships from the next release.
  3. The docs and the Audit page use `npx -y @intentlock/cli …` for one-off commands (keygen, audit verify) and `npm install -g @intentlock/cli` where several commands follow.
- **Alternatives:** the CLI inside the server Docker image (covers keygen for self-hosters, but not an auditor checking an export on their own machine); docs links to the clone build only (the barrier stays).
- **Consequences:** ELv2 allows anyone to install and run the CLI; it forbids offering it as a managed service. It depends only on `@intentlock/core`, `commander` and `zod`, and no server or inbox code is copied into it. A breaking CLI change bumps all six packages.
- **Amendment (2026-10-20):** 0.2.1 was published with `npm publish`, which kept `workspace:*` and `catalog:` in its dependencies, so it cannot be installed (`EUNSUPPORTEDPROTOCOL`). npm does not allow republishing a version, so `@intentlock/cli` 0.2.2 is published alone with `pnpm publish` (it uses only core exports that are in core 0.2.1), and 0.2.1 is deprecated. This is a one-off break of the lockstep; the next `pnpm release` sets all six to the same version again. Publish only through `pnpm release` or `pnpm publish`, never `npm publish`.

### ADR-080: Pausable holds with app-side checkpoints
- **Date:** 2026-10-23 · **Status:** Accepted (Abdullah, 2026-10-23: design, guard API, per-agent webhook route and Supabase Storage for TriStack)
- **Context:** On a hold the guard waits in `waitForHold` (long-poll, `GET /v1/holds/:id/wait`, ≤ 25 s per request, server polls the hold row every 1 s). The agent process stays alive for the whole hold (up to 30 min for the TriStack bot) and the wait is lost if the process or CI job dies; the hold can still be approved, but nothing runs. A server-side worker (BullMQ was suggested) cannot resume the task: Intentlock decides, it never runs tools, and the tool code, GitHub token and model key live in the team's app.
- **Decision:**
  1. **Guard pauses instead of waiting (opt-in).** A new guard option makes `run()` return `{ status: "suspended", holdId, checkpoint }` when a call is held; the process can exit. The checkpoint holds the messages so far, plan id and token, the held call and the results of the other calls in that turn. `guard.resume(checkpoint, outcome)` refreshes the token (same plan hash only), runs exactly the approved call and continues the loop. Long-poll waiting stays the default.
  2. **Server queues the resolution.** Approve, reject and expiry write a "hold resolved" event in the same transaction as the status change (outbox pattern). A delivery worker reads events with `FOR UPDATE SKIP LOCKED` and posts a signed webhook to a URL set per agent, with retries and backoff; each delivery result is audited. Postgres only: no Redis or BullMQ, so self-hosting stays one `docker compose up` and the server stays stateless.
  3. **The server stores no checkpoints.** Today it never sees tool results; checkpoints contain the whole conversation (issue text, files, emails) and can be hundreds of KB. They live in the team's app through a `CheckpointStore` interface in `@intentlock/guard` (`save`, `load`, `delete`, keyed by hold id), with optional AES-GCM encryption (`node:crypto`, key from the app's secrets). Built-ins: a file store and an S3-compatible store.
  4. **Resume never trusts the checkpoint.** It asks the server for the hold's status and the exact tool and arguments it was created for, and runs the call only if they match; the token can only be refreshed for the same plan; every later call goes through the normal checks. A tampered checkpoint can only break its own run.
  5. **TriStack** stores checkpoints in **Supabase Storage** (free tier, S3-compatible, private bucket, encrypted with a repo secret). The webhook calls GitHub `repository_dispatch` to start a short resume job. Checkpoints are deleted after resume and expire after the longest hold timeout plus a margin.
- **Alternatives:** BullMQ worker on the server (needs Redis, and the server cannot run the team's tools); checkpoints in Postgres or server-side object storage (the server would hold conversation data and need another service); GitHub Actions artifacts (rejected by Abdullah); Cloudflare R2 (payment card not supported); returning "pending" to the model and continuing (the model acts on an action that may be rejected); keep long-poll only (fine for TriStack, whose Actions minutes are free, but runs are lost on restart).
- **Consequences:** New public API in `@intentlock/guard` (`resume`, `CheckpointStore`, suspended run result), a webhook URL and signing secret per agent (migration, admin-only audited route in `API_ENDPOINTS`), and a delivery worker. The checkpoint carries a plan token (expires within 60 min; refresh needs the API key), so stores must be private. Waiters on the long-poll path keep the 1 s poll until `LISTEN/NOTIFY` (backlog).
- **Build notes (2026-10-23, agreed with Abdullah):**
  - **Generic, not TriStack-shaped.** The server posts to any URL the admin sets; the guard takes any `CheckpointStore`. TriStack (Supabase bucket, a relay that verifies the signature and calls `repository_dispatch`, since GitHub needs its own token and body) is a follow-up task after the next npm release, and a docs recipe, not product code.
  - **Routes.** `PUT /v1/agents/:id/webhook` `{ url }` → `{ url, secret }` (secret `il_whsec_…` shown once, new on every PUT), `DELETE` removes it; `API_ENDPOINTS.AGENT_WEBHOOK`. Resume reads the hold through the existing wait route: `GET /v1/holds/:id/wait` now also returns `planId`, `callId`, `tool`, `args`, and `timeout=0` answers at once. No new agent route.
  - **Deviations from the decision text.** `guard.resume(checkpoint)` has no `outcome` argument: the outcome always comes from the server (point 4). Checkpoints are keyed by **plan id**, not hold id, so one checkpoint covers every held call in a turn; resume returns `suspended` again until all of them are resolved.
  - **Gate state.** `HybridGate` keeps the client audit chain head and per-step counters in memory; a resume in a new process would restart the chain at 1 and be rejected. The checkpoint carries that state (`Gate.exportPlan`/`importPlan`, schema `GatePlanState` in core). The three new `Gate` methods (`holdInfo`, `exportPlan`, `importPlan`) are optional so custom gates keep compiling; `onHold: suspend` requires `holdInfo`. Without encryption, an edited gate state could lower local call counts; the server still re-checks every client entry and flags looser decisions, and `encryptionKey` (AES-GCM) makes edits fail to load.
  - **Delivery.** `HoldEvent` rows are inserted only for agents with a webhook URL. Claim = `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)` with a 60 s lease, so no transaction stays open during the HTTP call; the result update is guarded by `attempts` so a stale worker cannot overwrite it. Retries 10 s, 30 s, 2 min, 10 min, 30 min, 1 h, 2 h (8 attempts, about 4 h); a removed webhook fails at once. Every attempt is audited (`hold_webhook`). At least once; receivers dedupe on the event id.
  - **No new dependencies.** HMAC signing uses WebCrypto in core; S3 uses a hand-written Signature V4 over `fetch` (checked against the AWS published example); encryption uses `node:crypto`. `HoldStatus` moved from sdk to core (still exported by sdk).
  - **Webhook URLs** accept `http` and `https` (local receivers in development); only admins can set them, so server-side request forgery is limited to what an admin of a self-hosted install can already do.

### ADR-081: Visual policy builder
- **Date:** 2026-10-23 · **Status:** Accepted (Abdullah, 2026-10-23: free feature, rewrite-and-warn for YAML extras, drag plus up/down)
- **Context:** Policies are edited as YAML in the inbox (CodeMirror, errors as you type, publish with a 409 on a stale base). Early user 1 asked for forms. Phase 7 listed a visual rule builder as a paid candidate.
- **Decision:**
  1. **Free.** It is in every edition and has no license check. It changes how a policy is written, not what is enforced.
  2. **One format.** The form edits the same YAML source the editor shows; there is no second stored format. A form change serializes the whole policy with core `policyToYaml` and goes through the same `policyDiagnostics`, test panel and publish route (including the 409). Switching between Form and YAML is lossless for everything the form can show: `parsePolicy(policyToYaml(p))` equals `p` for every rule shape (unit tests).
  3. **Coverage.** Everything in `PolicySet`: rule id, decision, reason, `match` and `except` with tool (one or several), every argument condition (`eq`, `in`, `notIn`, `glob`, `notGlob`, `regex`, `lte`, `gte`), user email / role / group and `inPlan`; for holds, approver roles, emails, `self` and `timeoutSeconds`. `default` is always `block` and is shown as text.
  4. **What the form cannot show.** Comments and anchors/aliases: the form opens read-only with a notice; "Edit in form" removes them (the YAML is rewritten in the standard layout) after a confirm. Argument values whose type the form cannot keep (objects, lists inside `eq`, `null`, strings that would read back as a number or boolean): that rule is shown read-only with "Edit in YAML"; the other rules stay editable and the rule is written back unchanged. A YAML syntax error: the form shows "Fix the YAML first".
  5. **Order.** Rules keep first-match-wins order. Reorder with native HTML drag handles and move up/down buttons (phones, keyboard). No drag-and-drop library.
  6. **Where the code lives.** `policyToYaml` and `yamlExtras` (comments, anchors) in `@intentlock/core` (pure; `yaml` is already a core dependency). The form model (value parsing, which rules the form can show) and components in the inbox.
- **Alternatives:** paid feature (rejected by Abdullah); keep comments by editing YAML nodes in place (more code, comments inside edited rules still move); a form-only JSON format (two formats to keep in sync); `@dnd-kit` (new dependency; native drag plus buttons covers touch through the buttons).
- **Consequences:** No API, schema or license change. A form edit on a commented policy drops the comments, by design and after a warning. The Phase 7 "visual policy rule builder (paid feature candidate)" item is closed by this ADR.

### ADR-082: One paid license, free limited mode, all code in this repo
- **Date:** 2026-10-25 · **Status:** Accepted (Abdullah, 2026-10-25: single paid tier, free limited mode, per seat per year, all code stays in this repo). Supersedes the editions and feature flags of ADR-022 and PRD §11.
- **Context:** Intentlock will be sold as a self-hosted product. PRD §11 planned Community, Team and Enterprise editions with feature flags, but `hasFeature()` is never called, `retentionDays` is shown and never enforced, and the visual builder was made free (ADR-081). Three editions mean deciding, gating and testing every feature twice. The source is public (ELv2), so any check can be patched out by someone willing to break the license.
- **Decision:**
  1. **Two modes, one product.** *Free*: no license (or an invalid or expired one), limited to 5 active users, 3 agents and 30 days of audit retention, which are today's Community limits. *Licensed*: one paid license, priced **per seat per year**. Seats become `maxUsers`, agents are unlimited and retention comes from the license. Every feature is in both modes. Only the limits differ, so there are no feature flags.
  2. **License format.** Keep the vendor-signed Ed25519 JWS, verified offline (ADR-022). Remove `features`, `LicenseFeature` and `hasFeature()`. `edition` becomes `free | licensed`. No license has been sold, so the format can change without a migration path.
  3. **All code in this public repo**, under ELv2 (MIT for `core`, `sdk`, `guard`, `anthropic`). There is no private "enterprise" repo or image. The protection is the license itself: ELv2 forbids moving, changing, disabling or circumventing the license key functionality. The JWS can't be forged without the vendor private key, and buyers sign a contract. No obfuscation, phone-home or online activation, so installs keep working offline.
  4. **Never weaker security.** Expiry or a bad license only changes limits. Enforcement, holds and audit never stop. When a team ends up over the free limits, nobody is locked out and existing users and agents keep working. Only *creating* users or agents is refused until the team is back under the limit or applies a license.
- **Alternatives:** three editions with feature flags (more to build, test and explain to a small-team buyer); paid code in a private repo shipped only in paid images (two repos and builds, the seat check is still public, and it weakens the source-available pitch); online activation (breaks offline installs, conflicts with self-hosting); a trial-only mode that blocks after 30 days (harder adoption).
- **Consequences:** A user can patch the limits out of their copy. That breaches ELv2, and it's accepted as the cost of shipping source. Retention purge, a License page in the inbox and expiry warnings become required before the first sale (PLAN Phase 8). README and the site's licensing page say in plain words that use beyond the free limits needs a license. A lawyer reviews ELv2 and the commercial terms before the first sale. Not legal advice.
- **Amendment (2026-10-25, Abdullah):** a license keeps its full limits for a 14-day grace period after `exp`, then free limits apply. No banner during the grace period; admins are warned only before expiry (banner and email at 30, 7 and 1 days). A paid license defaults to 365 days of audit retention. A seat is an active (not disabled) user, as `maxUsers` counts today.
- **Build notes (2026-10-25, License page):** the applied key is stored as the signed JWS in a `License` row (one per org) and re-verified on every load, so editing the row only drops the install to the free limits. `LICENSE_FILE`, when set, wins and the inbox routes answer 409. Every instance re-reads every 60 s (was 24 h), so no restart and no cross-instance message is needed. `Organization.licenseClockAt` keeps the latest time seen and verification uses the later of it and the server clock: setting the clock back no longer revives an expired license. Limits of that check: someone who edits the database can clear the column too (that is tampering with the license-key functionality, ELv2), and a server clock once set far ahead makes the license look expired until the column is cleared by hand.
- **Amendment (2026-10-27, Abdullah):** the license is re-read every hour, not every 60 s. The instance that receives `PUT`/`DELETE /v1/license` reloads at once; other instances follow within an hour, and expiry warnings and the end of the grace period are noticed within an hour.
- **Build notes (2026-10-27, expiry):** the grace period is a `grace` status that keeps the license's limits; applying a key that is already in grace is refused as expired. Warnings are claimed in `LicenseNotice` (unique per org, license expiry and kind) before any email is sent, so each goes out once across instances and a renewed license starts its own. When several points are due at once (a key applied with 5 days left) only the closest one is sent. The inbox banner shows during the whole last 30 days instead of only on the three warning days, which is simpler and harder to miss.

### ADR-083: Audit retention shows history; deleting old entries is opt-in and archived first
- **Date:** 2026-10-28 · **Status:** Accepted (Abdullah, 2026-10-28: the license limits what is visible, deletion is off by default, settings in env, S3-compatible or folder archives, a NoSQL store may follow)
- **Context:** ADR-082 planned a daily purge of entries older than the license's `retentionDays`. That deletes a free install's audit history after 30 days and a lapsed customer's after the grace period: licensing would destroy audit data, which CLAUDE.md forbids ("never disables audit"). Teams still need a way to keep the database small, and Abdullah plans to move old entries into a NoSQL store later.
- **Decision:**
  1. **Retention is a visibility window.** `retentionDays` from the license limits how far back Activity, run lists, stats and the audit export reach (`at >= now - retentionDays`). Nothing is deleted because of the license. The server's chain verify always walks every stored entry. A license makes older history visible again.
  2. **Deletion is opt-in, set in env, off by default.** `AUDIT_DELETE_AFTER_DAYS` (unset = never delete; minimum 90). It needs an archive target: `AUDIT_ARCHIVE_S3_URL` (bucket URL of any S3-compatible store: AWS S3, Cloudflare R2, MinIO, Backblaze, Supabase) with `AUDIT_ARCHIVE_S3_REGION`, `AUDIT_ARCHIVE_S3_ACCESS_KEY_ID`, `AUDIT_ARCHIVE_S3_SECRET_ACCESS_KEY`; otherwise `AUDIT_ARCHIVE_DIR` (a volume). The server refuses to start with deletion on and no archive target. Keys stay in env, never in the database.
  3. **Archive first, verify the copy, then delete.** A daily job on one instance at a time (advisory lock) takes up to 10 000 of the oldest entries older than the cutoff, writes them as one JSONL file (`audit-<fromSeq>-<toSeq>.jsonl`, the export format), reads it back and compares its SHA-256. Only then, in one transaction under the chain lock, it appends an `audit_purged` entry (`fromSeq`, `toSeq`, `lastHash` = hash of entry `toSeq`, archive `{ target, name, sha256 }`) and deletes entries `fromSeq..toSeq`. A failed write or a mismatched read-back deletes nothing, is logged and audited (`audit_purge_failed`), and emails admins once per day.
  4. **Verify after deletion.** The first kept entry's `prevHash` must equal the `lastHash` of an `audit_purged` entry whose `toSeq` is the seq just before it; that `audit_purged` entry is itself in the chain, so it cannot be edited silently. Server verify and the Audit page report "verified from seq N (entries before were archived)". Deleting rows without an archive leaves a first entry that matches no anchor, so verify fails. core `verifyChain(entries, { from })` accepts a starting hash; the CLI `audit verify --file export.jsonl [--archive <file>...]` checks archives plus export end to end, and checks a windowed export from its first entry's `prevHash`.
  5. **Archive targets behind one interface** (`put`, `get` of named files) in the server: folder and S3-compatible now. A NoSQL store can be added later as another target; the purge job and the anchor format do not change. Archives are cold storage: the inbox does not read them back.
  6. **S3 signing moves to core.** The Signature V4 signer from ADR-080 (`guard/src/checkpoints/sigv4.ts`, `node:crypto`) becomes a WebCrypto function in `@intentlock/core` (pure, no I/O, like webhook signing), used by `S3CheckpointStore` and the server. No new dependency.
- **Alternatives:** purge by license retention (destroys audit data on a lapsed license); delete without an archive (no tamper evidence for what was deleted); archive settings in the inbox (S3 keys in the database, more routes); Merkle anchors per batch (more than a single `lastHash` needs, since batches are contiguous).
- **Consequences:** The free mode's 30 days and a license's retention change what people see, not what is stored, so ADR-082's "retention comes from the license" now means visible history. The License and Audit pages say so. Databases grow unless an admin turns deletion on. Archived entries are only readable from the archive files. `verifyChain` gains an optional argument (backward compatible).
