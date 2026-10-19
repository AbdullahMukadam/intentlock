---
title: Core
description: Schemas, policy parsing, the check function and audit verification from @intentlock/core.
---

`@intentlock/core` holds the pieces every other package shares. It has no I/O: no network, no database, and no clock except one you pass in. You rarely need it directly, but it is there for tooling, tests and custom gates.

## Policies

`parsePolicy` turns YAML into a validated policy, with line and column numbers for every error:

```ts title="check-policy.ts"
import { readFileSync } from "node:fs";
import { parsePolicy } from "@intentlock/core";

const parsed = parsePolicy(readFileSync("policy.yaml", "utf8"));
if (!parsed.ok) {
  for (const e of parsed.errors) {
    console.error(`${e.line}:${e.col} ${e.path} ${e.message}`);
  }
  process.exit(1);
}
console.log(parsed.policy.rules.map((r) => r.id));
```

`STARTER_POLICY` is the YAML every new agent starts with.

## Schemas

Zod schemas for the formats on the wire: `Plan`, `PlanStep`, `ArgConstraint`, `PolicySet`, `Rule`, `Match`, `ApproverSpec`, `ToolCall`, `Decision`, `GateDecision`, `AuditEntry` and `ClientEntry`. `TOOL_NAME` is the tool name pattern.

## Enums

`Verdict`, `BlockReason`, `ClientBlockReason`, `ReportOutcome` and `ClientEntryKind` hold the values that cross packages and the wire.

## Deciding

`check(bundle, call, usage)` is the pure decision function used by the server and the gates. It takes the verified token claims, the call and the per-step usage counts, and never throws: any error becomes a block with `internal_error`. `decide()` wraps it with token verification and usage counting.

## Audit

`verifyChain(entries)` walks exported audit entries in order and returns `{ ok: true, count }` or the first broken sequence number with a reason. It is what `intentlock audit verify` runs.

```ts title="verify-audit.ts"
import { readFileSync } from "node:fs";
import { verifyChain } from "@intentlock/core";

const lines = readFileSync("audit.jsonl", "utf8").split("\n").filter(Boolean);
const result = await verifyChain(lines.map((line) => JSON.parse(line) as unknown));
if (result.ok) console.log(`ok, ${result.count} entries`);
else console.log(`broken at ${result.firstBrokenSeq}: ${result.reason}`);
```

## API paths

`API_ENDPOINTS` lists every server route, and `apiPath` fills in parameters:

```ts
import { API_ENDPOINTS, apiPath } from "@intentlock/core";

const path = apiPath(API_ENDPOINTS.HOLD_WAIT, { id: "hold_123" });
const url = `https://intentlock.acme.dev/api${path}`;
```
