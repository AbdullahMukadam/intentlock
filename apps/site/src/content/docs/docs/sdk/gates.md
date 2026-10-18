---
title: Gates
description: Pick a gate, configure it, and call it directly if you do not use the guard.
sidebar:
  order: 4
---

| Gate | Decisions | Holds | Audit | Use when |
| --- | --- | --- | --- | --- |
| `HybridGate` | Locally, against the signed token | Server | Local outbox, uploaded in batches | Production default. No network request on allow or block. |
| `HttpGate` | Server, every call | Server | Per call | You want instant revocation and shared call limits. |
| `LocalGate` | In-process | Blocked | In memory | Unit tests, evals, offline development. |
| `PassThroughGate` | Allows everything | | | Unprotected baselines only. Never in production. |

The trade-offs are explained in [Hybrid and remote gates](/docs/concepts/gates/).

## HybridGate

```ts
import { HybridGate } from "@intentlock/sdk";

const gate = new HybridGate({
  baseUrl: process.env.INTENTLOCK_URL!,
  apiKey: process.env.INTENTLOCK_API_KEY!,
  outboxDir: "/var/lib/my-agent/outbox",
  onError: (err) => console.error("intentlock", err),
});
```

| Option | Default | Notes |
| --- | --- | --- |
| `outboxDir` | `.intentlock/outbox` | Must be writable and survive restarts. `null` keeps the outbox in memory (serverless): a crash can lose that request's entries. |
| `flushIntervalMs` | `5000` | Upload interval. |
| `maxBatch` | `100` | Entries per upload. |
| `maxUnacked`, `maxUnackedAgeMs` | `500`, `60000` | If the server falls this far behind, calls block with `audit_backlog`. |
| `flushTimeoutMs` | `10000` | How long `close()` waits for the final upload. Anything left is sent on the next start. |
| `timeoutMs` | `5000` | Per request to the server. |
| `handleSignals` | `true` | Flushes on `SIGTERM` and `SIGINT`. |
| `onError` | | Background errors: upload failures (retried with backoff), key reloads, hold-wait retries, and outbox lines that could not be recovered after a restart. |

Each process needs its own outbox directory. On start, the gate uploads anything left from a previous run. Call `gate.close()` when your process is done, so the outbox flushes.

## HttpGate

```ts
import { HttpGate } from "@intentlock/sdk";

const gate = new HttpGate({
  baseUrl: process.env.INTENTLOCK_URL!,
  apiKey: process.env.INTENTLOCK_API_KEY!,
  timeoutMs: 5000,
});
```

Any network error, timeout or 5xx is a block (`server_unavailable`).

## Using a gate directly

Without the guard, you call the gate yourself, and you are responsible for running the tool only on `allow`:

```ts
import { ReportOutcome } from "@intentlock/core";

const { token } = await gate.signPlan({
  version: 1,
  goal: "Triage issues",
  user: "alice@acme.dev",
  steps: [{ tool: "github_list_issues" }],
});

const call = { tool: "github_list_issues", args: { repo }, callId: "c1" };
const decision = await gate.check(token, call);

if (decision.verdict === "allow") {
  await github.listIssues(repo);
  await gate.report(token, "c1", ReportOutcome.OK);
} else if (decision.verdict === "hold") {
  const outcome = await gate.waitForHold(decision.holdId, { timeoutMs: 300_000 });
  if (outcome === "approved") await github.listIssues(repo);
}
```

| Method | Does |
| --- | --- |
| `signPlan(plan)` | Signs a plan. Returns `planId`, `token`, `planHash`, `policyVersion`, `policyHash`, `expiresAt`. |
| `refresh(planId, token)` | Re-signs the same plan with a new expiry. |
| `check(token, call)` | Returns the decision. A hold carries a `holdId`. |
| `waitForHold(holdId, { timeoutMs, signal })` | Resolves to `approved`, `rejected` or `expired`. |
| `report(token, callId, outcome)` | Records whether the tool ran successfully. |
| `close()` | Flushes and stops background work. |
