---
title: Testing
description: Test your agent with LocalGate and FakeProvider, without a server or a model key.
sidebar:
  order: 6
---

`LocalGate` decides in-process with a signing key and a policy you give it, and `FakeProvider` replays scripted model turns. Together they run the whole guard with no server, no database and no LLM key.

```ts title="agent.test.ts"
import { readFileSync } from "node:fs";
import { generateSigningKeyPair, parsePolicy } from "@intentlock/core";
import {
  createGuard,
  DECLARE_PLAN,
  FakeProvider,
  RunStatus,
  toolset,
} from "@intentlock/guard";
import { LocalGate } from "@intentlock/sdk";

const parsed = parsePolicy(readFileSync("policy.yaml", "utf8"));
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));

const gate = new LocalGate({
  privateKey: (await generateSigningKeyPair()).privateKey,
  policies: parsed.policy,
  users: { "alice@acme.dev": { role: "member", groups: ["intern"] } },
});

const provider = new FakeProvider([
  {
    toolCalls: [
      {
        id: "plan",
        name: DECLARE_PLAN,
        args: { goal: "List issues", steps: [{ tool: "github_list_issues" }] },
      },
    ],
  },
  {
    toolCalls: [
      { id: "c1", name: "github_list_issues", args: { repo: "acme/public-app" } },
      {
        id: "c2",
        name: "github_post_comment",
        args: { repo: "acme/public-app", issue: 1, body: "hi" },
      },
    ],
  },
  { text: "Done", toolCalls: [] },
]);

const events: string[] = [];
const guard = createGuard({
  provider,
  gate,
  ...toolset(tools),
  onEvent: (e) => events.push(`${e.type} ${e.tool ?? ""}`),
});

const result = await guard.run({ user: "alice@acme.dev", task: "List open issues" });
console.log(result.status === RunStatus.COMPLETED, events);
```

`users` maps emails to a role and groups, which `user.role` and `user.group` matches use. With it, plans for anyone not in the map are refused, like on the server. Without it, every user is a `member` with no groups. Hold rules block with `hold_requires_server`, since there is no server to approve them.

A runnable example lives in the repository: `pnpm --filter @intentlock/sdk run example`.
