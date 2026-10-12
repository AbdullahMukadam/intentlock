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
- **Date:** _TBD in Phase 3_ · **Status:** Proposed
- **Context:** Need one reliable, free tool-calling model for the demo and evals.
- **Decision:** _Fill in after the Phase 3a comparison: model, provider, base URL, why, observed tool-call reliability._

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
- **Date:** 2026-10-11 · **Status:** Accepted
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
