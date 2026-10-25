# PRD — Intentlock

**Status:** Draft v1 · **Owner:** Abdullah Mukadam · **Target:** working v0.1 in 7 days (11–17 Oct 2026)

## 1. Summary

Intentlock is a self-hosted authorization layer for LLM agents, built for small teams. The SDK packages are MIT-licensed; the server and inbox are source-available (Elastic License 2.0) so the product can be sold later. Before an agent touches untrusted data, it declares a plan of the tools it intends to use. Intentlock signs that plan (Ed25519, short TTL). Every tool call is then checked against the signed plan and a set of policies, and is allowed, blocked, or held for human approval. Every decision is written to a hash-chained, tamper-evident audit log.

A team runs one Intentlock deployment (server + inbox + Postgres, one `docker compose up`) for its own agents. It ships as TypeScript packages: a provider-agnostic agent guard (adapters for Anthropic and any OpenAI-compatible API, which covers Gemini, Groq, OpenRouter and local Ollama models), a NestJS policy service, a Next.js approval inbox, and (stretch) an MCP proxy that guards any MCP server.

## 2. Problem

Agents with real tools can be hijacked by text they read. In May 2025, Invariant Labs showed an agent using the GitHub MCP server being tricked by a malicious public issue into reading the owner's private repos and leaking them in a public pull request ([write-up](https://invariantlabs.ai/blog/mcp-github-vulnerability)). The tools were trusted; the model was a frontier model; the token simply had too much access and nothing checked whether each action matched what the user asked for.

Identity-based access ("this token can access these repos") is too coarse. What is missing is **intent-based** access: "for *this* request, the agent may only do *these* things."

## 3. Goals

1. Block tool calls that are outside the plan the user's request produced, even when the model has been prompt-injected.
2. Let developers express rules (repo scope, amounts, recipients) and route risky-but-legitimate actions to a human.
3. Produce an audit trail that can be verified as untampered.
4. Add little latency: one check per tool call, small next to a model call.
5. Be easy to adopt: wrapping an existing agent takes about five lines, whichever model provider it uses.

## 4. Non-goals (v0.1)

- Detecting prompt injection in text (classifiers). Intentlock constrains *actions*, not content.
- Preventing data leaks through the *content* of an allowed action (e.g. an allowed comment that contains private data). Mitigated by holds on public writes; documented as a limitation.
- Multi-tenant SaaS hosting. v0.1 is single-tenant (one team per deployment), but every table carries an `orgId` so a hosted version is possible later.
- Billing, SSO/SAML, SCIM. v0.1 only builds the licensing groundwork (§11, ADR-082).
- Fully open source. Only the SDK packages are MIT.
- Supporting every agent framework (LangChain, ADK, ...). v0.1 = own guard loop with two provider adapters (Anthropic, OpenAI-compatible) + MCP proxy (stretch).
- Streaming responses. The guard works on complete model responses.
- Distributed consensus or blockchain-backed logs.

## 5. Target customer and users

**Target customer:** a small team (roughly 2–50 people) building internal or customer-facing agents in TypeScript, who want guardrails they host themselves, on their own infrastructure, with their own data. One deployment serves one team; no multi-tenancy.

| User (all members of the same team) | Role in Intentlock | Needs |
| --- | --- | --- |
| **Admin** (often the lead developer) | `admin` | Install and run Intentlock, add teammates, register agents and create their API keys, edit and publish policies in the inbox, apply a license |
| **Agent developer** | `member` (or `admin`) | Wrap an agent with `createGuard()` using its API key, propose policy changes, see why a call was blocked |
| **Teammate the agent acts for** | `member` | Their agent runs are attributed to them; they see their own held actions |
| **Approver** (lead, on-call) | `approver` | Sign in to the inbox, see held actions with context, approve or reject quickly |
| **Auditor / security reviewer** | `admin` or `approver` | View and export the log, verify it has not been altered |

An **agent** is one AI application the team runs (e.g. a GitHub triage bot); a team typically registers 1–10. Each agent has its own API keys and its own versioned policy.

Nothing in the inbox is visible without signing in. Every agent run is tied to a real team member (the plan's `user` must be an active user), and every approval is tied to the signed-in approver, so the audit log always says who did what.

## 6. User stories

- As a developer, I wrap my agent with `createGuard()` and every tool call is checked without changing my tool code.
- As a developer, I switch from a free Gemini/Groq/Ollama model to Claude by changing the provider, not the guard code.
- As a developer, I write a YAML policy that blocks any GitHub action outside `acme/public-app` and holds `post_comment`.
- As a developer, when a call is blocked, the model receives a clear error and can explain it to the user instead of crashing.
- As an admin, I run `docker compose up`, get a first-login link for myself, and add teammates with `intentlock users add`.
- As an admin, I register an agent in the inbox, create an API key for it (shown once), and hand the key to the developer.
- As an admin, I edit an agent's policy in the inbox, see errors as I type, test the draft against recent real decisions, review the diff, and publish it with a message — no files, no redeploy. If it causes problems, I roll back in one click.
- As a team lead, I open the dashboard and see how many actions each agent had allowed, blocked and held this week, and which rules block most often.
- As an approver, I open a run and see every tool call in order with the rule that decided it.
- As an approver, I sign in to the inbox, see "Agent wants to `post_comment` on `acme/public-app#3` for alice@acme.com — goal: triage issues" and approve it in one click; the agent then continues.
- As a team member, I cannot approve my own held actions unless the policy explicitly allows it.
- As an auditor, I run `intentlock audit verify` and get either "chain intact, N entries" or the first broken entry.
- As a developer, I run the eval suite and get attack success rate, task completion and latency, with and without Intentlock.

## 7. Functional requirements

### Plans and tokens
- FR1 · A plan has a goal, a user, and steps. Each step names a tool and may pin argument values (e.g. `repo = acme/public-app`) and a max call count.
- FR2 · Plans are canonicalized (RFC 8785 JSON Canonicalization) and hashed (SHA-256).
- FR3 · The server signs plans into an EdDSA (Ed25519) JWS token with `exp` (default 15 min).
- FR4 · A planner mode produces the plan from the user's request in a separate model call *before* any tool runs, using a `declare_plan` tool. Untrusted content never reaches the planner.

### Enforcement
- FR5 · `check(token, call)` verifies signature and expiry, matches the call against plan steps, then evaluates policies. Result: `allow | block | hold` + reason + rule id.
- FR6 · Policies: ordered rules with match conditions on tool, args (equals, glob, regex, number comparisons, in-list), user email, role and groups; first match wins; default `block`.
- FR6a · Hold rules name who may approve: roles, specific emails, and/or `self` (the requesting user). The requester can approve their own hold only when `self: true`.
- FR6b · Each agent has one policy. Policies are stored as immutable, numbered versions in the database; exactly one is active. The bundle records the policy version, and so does every decision.
- FR7 · Holds create a pending approval with a `holdId`. The client waits (long-poll) up to a timeout; approved → allow, rejected/timeout → block.
- FR8 · `report(token, call, outcome)` records that an allowed call actually ran; the plan is `completed` when all required steps ran.
- FR9 · Gate implementations behind one interface: `HybridGate` (default: verifies the signed bundle and decides allow/block locally; server only for holds and audit), `HttpGate` (remote: every check on the server), `LocalGate` (in-process, tests/evals; no holds).
- FR9a · The signed bundle contains the plan, the user's policy snapshot, role and groups, so local decisions need no network call.
- FR9b · Hybrid decisions are appended to a local outbox file (hash-chained, fsynced) before the tool runs; a background worker uploads them in batches; the server re-checks them and flags mismatches or gaps.
- FR9c · If the audit backlog grows past a limit (count or age), the client blocks new calls until uploads catch up.

### Agent guard (provider-agnostic)
- FR10 · `guard.run()` runs a full tool-calling loop; `guard.execute(toolCalls)` checks and runs one turn's tool calls for developers with their own loop.
- FR11 · Every tool call gets exactly one result; blocked/rejected calls return an error result with the reason.
- FR12 · Multiple tool calls in one turn are checked concurrently and independently.
- FR12a · The guard talks only to an `LLMProvider` interface. v0.1 ships `OpenAICompatibleProvider` (Gemini, Groq, OpenRouter, Ollama via base URL), `AnthropicProvider`, and `FakeProvider` (scripted responses for tests and the forced-attack demo mode).
- FR12b · Provider and model are chosen by config (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`); the same agent code runs on any of them.
- FR13 · Lifecycle events: `plan_signed, allow, block, hold, approved, rejected, timeout, error`.

### Team, sign-in and approval inbox
- FR13a · Users have an email, a role (`admin | approver | member`) and optional groups (labels used by policies, e.g. `intern`, `oncall`).
- FR13e · **Nothing is public except the sign-in page.** Every page and API route requires a session unless explicitly marked public (sign-in, health, JWKS) or agent-only (API key). The WebSocket requires a session too. Admins and approvers see all activity; members see their own runs.
- FR13b · On first boot the server prints a one-time setup code; the inbox setup page uses it to create the first admin. Accounts are invite-only: admins invite, disable and create reset links in the inbox Team page or with `intentlock users ...`; people sign in with a password or Google/GitHub (ADR-058).
- FR13c · Sign-in: email + personal login token → httpOnly session cookie. Tokens are stored hashed; sessions expire.
- FR13d · Agent apps authenticate with API keys (created by admins); humans authenticate with sessions. Approve/reject accept sessions only, never API keys.
- FR14 · Lists pending holds live (WebSocket), with tool, args, user, plan goal, and time waiting. Approvers see holds they may approve; members see their own.
- FR15 · Approve / reject with optional note; the approver is taken from the session (never from the request body); the decision is audited.
- FR16 · Audit viewer: filter by user / plan / decision; "Verify chain" button.

### Agents and API keys
- FR25 · Admins create agents (name, description) in the inbox; each new agent starts with a safe starter policy (default block, allow in-plan calls) as v1.
- FR26 · Admins create named API keys per agent (`il_live_…`, shown once, stored hashed, prefix and last-used shown), revoke them, and disable agents. Revocation and disabling stop new plans immediately.
- FR27 · Plan signing identifies the agent from the API key and snapshots that agent's active policy.

### Policy management (inbox editor)
- FR28 · YAML policy editor with live validation in the browser (shared core parser, errors on the exact line); the server re-validates on save and publish.
- FR29 · Dry-run test of a draft against sample calls and/or a replay of the agent's last N decisions, showing what would change.
- FR30 · Diff of draft vs active; publish with a required message; conflicting concurrent publishes are rejected (409).
- FR31 · Version history with author, message and date; roll back by publishing a copy of an older version. Publishes and rollbacks are audited.
- FR32 · Optional Git workflow: `intentlock policy pull | test | push`, going through the same validation and versioning.

### Dashboard
- FR33 · Overview: allowed / blocked / held over time per agent, pending holds, median time-to-approve, top blocked tools and rules, flagged entries, audit upload lag.
- FR34 · Activity: every decision with filters (agent, user, tool, verdict, rule, policy version, time), search and JSONL export.
- FR35 · Run detail: one run's plan, policy version and every tool call in order with verdict, deciding rule, approval and timing.

### Audit
- FR17 · Every plan signing, check, hold, resolution and report is an append-only entry.
- FR18 · Each entry stores `prevHash` and `hash = SHA-256(prevHash || canonical(entry))`.
- FR19 · `GET /v1/audit/verify` and a CLI recompute the chain and report the first mismatch.

### Demo and evals
- FR20 · Three free-to-run demo agents, each with a seeded attack and its own policy: **github-assistant** (Invariant-style private-repo leak via PR), **support-assistant** (Mailpit inbox; forward-to-attacker email; refund thresholds; group rules), **files-assistant** (sandbox folder; exfiltrate `.env` to a webhook). Each runs unprotected and protected side by side.
- FR20a · Our own deployed instance (free hosting, sign-in required, not public) is used for the demo and the recorded video; recruiters see the video, not the instance.
- FR21 · ~30 prompt-injection scenarios across GitHub, email and file tools with mock backends; runner outputs a results table.

### Licensing groundwork
- FR23 · The server verifies an optional signed license file offline at boot and daily. No file or an invalid/expired file → Community edition limits. Licence problems never disable enforcement: they only change limits.
- FR24 · Entitlements (edition, max users, max agents, audit retention, feature flags) are checked in one place (`LicenseService`); v0.1 enforces max users and max agents and exposes the flags for future paid features.

### MCP proxy (stretch)
- FR22 · A stdio MCP proxy that forwards to an upstream MCP server and enforces Intentlock on `tools/call`.

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Security | Fail closed on every error path. Private keys never leave the server. API keys, login tokens and session ids stored hashed. Every approval tied to an authenticated person. |
| Self-hosting | One `docker compose up` brings up server, inbox and Postgres with sane defaults; all config via env vars; works offline (license checks are offline). |
| Latency | Measure and report p50 / p95 check latency for `LocalGate` and `HttpGate`. Target: check overhead well under the model call time. |
| Reliability | Server restart does not lose pending holds (persisted in Postgres). Client crash does not lose decisions (outbox file, recovered on restart). |
| Scalability | Allow/block checks in hybrid mode never touch the server; server load scales with plans, holds and audit batches, not tool calls. |
| Testability | `packages/core` is pure and fully unit-tested. |
| DX | Wrapping an agent ≤ 5 lines. Errors say which rule or plan step decided. |
| Docs | README with 60-second quickstart, architecture diagram, demo GIF, eval results. |

## 9. Success metrics (for v0.1)

- Attack success rate on the eval suite: **unprotected vs protected**, reported honestly and labelled with the exact provider and model used.
- Benign task completion rate with Intentlock on (should stay close to unprotected).
- Check latency p50 / p95 for remote vs hybrid mode, and audit upload lag.
- Demo video under 4 minutes recorded against our deployed instance: GitHub attack blocked, a hold approved, a policy edited/tested/published live, the dashboard and a run detail, plus short clips of the support and files agents.
- SDK packages published to npm (MIT); server and inbox images on GHCR; README a stranger can follow to self-host in under 10 minutes.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Model resists the injection, so the unprotected baseline doesn't leak | Tune payloads; use a smaller model for baseline; add a labelled "compromised model" mode that forces the bad call |
| Planner produces too-narrow plans and breaks benign tasks | Measure utility in evals; allow `max_calls` and arg globs; log plan misses |
| Scope creep in 7 days | MCP proxy and docs site are stretch; cut first |
| No paid Anthropic key (card not accepted) | Provider-agnostic guard; develop and evaluate on a free OpenAI-compatible model; Anthropic adapter tested with fakes |
| Free models call tools unreliably | Try 2–3 models early (Phase 3); pick the most reliable; tighten tool descriptions; record the choice in an ADR |
| Leak via allowed action content | Hold all public writes by default; document limitation |
| Auth, policy editor, dashboard and three demo agents add scope | CLI-only user management (team page is stretch); YAML editor rather than a visual builder; dashboard uses plain SQL; support/files agents are cut first; licensing = verify + limits only |
| Source-available license misunderstood or unsuitable | ELv2 chosen for clarity; confirm with a lawyer before selling (not legal advice) |

## 11. Business model

Self-hosted and source-available, sold as **one paid license** (ADR-082). Every feature is in every install; only the limits differ.

| Mode | Price | Limits |
| --- | --- | --- |
| **Free** | No license file (or an invalid or expired one) | Up to 5 active users, 3 agents, 30-day audit retention |
| **Licensed** | Per seat per year | Seats = active users, unlimited agents, retention set by the license, support |
| **Cloud** (much later) | Subscription | Hosted version, built on the `orgId` groundwork |

Licensing:
- **SDK packages** (`core`, `sdk`, `guard`, `anthropic`): MIT, so customers can embed them anywhere.
- **Server, inbox, CLI, evals, demo**: Elastic License 2.0. The source is public and usable, but it cannot be offered as a managed service, and the license-key checks cannot be removed or circumvented. All code stays in this repo; there is no private paid edition. Not legal advice; confirm before selling.
- **License keys**: a JWS signed with the vendor's Ed25519 key (separate from plan-signing keys), verified offline by the server. Contracts do the enforcing; no heavy DRM.
