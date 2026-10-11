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
