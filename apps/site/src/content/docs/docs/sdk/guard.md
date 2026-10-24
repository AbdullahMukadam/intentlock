---
title: Agent guard
description: Let the guard own your agent's tool loop. It plans, checks, runs tools and returns results.
---

`@intentlock/guard` owns the tool loop. You give it a provider, a gate and your tools; it asks the model for a plan, signs it, checks every call, waits on holds and returns one result per call.

```ts title="agent.ts"
import {
  createGuard,
  defineTool,
  providerFromEnv,
  RunStatus,
  toolset,
} from "@intentlock/guard";
import { HybridGate } from "@intentlock/sdk";
import { z } from "zod";

const listIssues = defineTool({
  name: "github_list_issues",
  description: "List open issues in a repository",
  schema: z.object({ repo: z.string() }),
  impl: ({ repo }) => github.listIssues(repo),
});

const postComment = defineTool({
  name: "github_post_comment",
  description: "Post a comment on an issue",
  schema: z.object({ repo: z.string(), issue: z.number(), body: z.string() }),
  impl: (args) => github.postComment(args),
});

const gate = new HybridGate({
  baseUrl: process.env.INTENTLOCK_URL!,
  apiKey: process.env.INTENTLOCK_API_KEY!,
});

const guard = createGuard({
  provider: providerFromEnv(),
  gate,
  ...toolset([listIssues, postComment]),
  system: "You are a GitHub triage assistant.",
  onEvent: (e) => console.log(e.type, e.tool ?? "", e.reason ?? ""),
});

const result = await guard.run({
  user: "alice@acme.dev",
  task: "Triage open issues in acme/public-app and label duplicates",
});

if (result.status === RunStatus.COMPLETED) console.log(result.text);
await gate.close();
```

## What `run()` does

1. Asks the model to call a built-in `declare_plan` tool with the steps it needs. The model sees the task and each tool's name, description and argument names, but no tool output and not your policy. Only your tools may appear in the plan.
2. Signs the plan through the gate.
3. Runs the tool loop. Each call is checked: allowed calls run your `impl`, everything else returns an error result so the model can continue or stop.
4. Ends when the model stops calling tools (`completed`), after `maxTurns` (`max_turns`), or, with `onHold: suspend`, when a call is held (`suspended`).

## Tools

- Names must match `^[a-zA-Z0-9_-]{1,64}$` (no dots). `declare_plan` is reserved.
- `defineTool` validates arguments with your zod schema before `impl` runs. Invalid arguments go back to the model as an error (`invalid_args`).
- If `impl` throws, the model gets `Tool failed: <message>` and the outcome is recorded in the audit log.
- `toolset([...])` returns the `tools` and `impls` options together.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `provider` | | Any `LLMProvider`. See [LLM providers](/docs/sdk/providers/). |
| `gate` | | `HybridGate`, `HttpGate` or `LocalGate`. See [Gates](/docs/sdk/gates/). |
| `tools`, `impls` | | Use `...toolset([...])`. |
| `planSource` | `planner` | `explicit`: you pass `steps` to `run()` instead of letting the model plan. |
| `onHold` | `wait` | `suspend`: return a checkpoint instead of waiting, and resume later with `guard.resume()`. See [Pause on a hold](/docs/sdk/pausable-holds/). |
| `holdTimeoutMs` | `300000` | How long a held call waits before it counts as rejected. |
| `maxTurns` | `20` | Model turns after the plan is signed. |
| `system`, `maxTokens` | | Passed to the provider. |
| `onEvent` | | Receives `plan_signed`, `allow`, `block`, `hold`, `approved`, `rejected`, `timeout` and `error`. Exceptions thrown inside it are swallowed. |

## Explicit plans

If your app already knows what the agent may do, skip the planner and pass the steps:

```ts title="agent.ts"
import { createGuard, PlanSource, toolset } from "@intentlock/guard";

const guard = createGuard({
  provider,
  gate,
  ...toolset(tools),
  planSource: PlanSource.EXPLICIT,
});

await guard.run({
  user: "alice@acme.dev",
  task: "Summarise open issues in acme/public-app",
  goal: "Summarise issues",
  steps: [
    {
      tool: "github_list_issues",
      args: { repo: { eq: "acme/public-app" } },
      maxCalls: 3,
    },
    { tool: "github_get_issue", args: { repo: { eq: "acme/public-app" } } },
  ],
});
```

Step fields are described in [Plans and tokens](/docs/concepts/plans-and-tokens/#the-plan).

## Keeping your own loop

If you already have an agent loop, use the guard only for planning and checking:

```ts
const session = await guard.start({ user: "alice@acme.dev", task });

const results = await guard.execute(session, toolCalls);
```

Call `execute` with the tool calls your model returned, then feed the results back to the model. It checks each call, waits on holds, runs allowed `impl`s, refreshes an expired token, and always returns exactly one result per call: `{ callId, content, isError }`.

## When the model call fails

If the model call fails (rate limit, outage, bad key), `run()` rejects with a `ProviderError` and the guard emits an `error` event. The error has `provider`, `status` (the HTTP status, or `null` for a network error) and `retryable` (network errors, 408, 409, 429 and 5xx). When it happened after the plan was signed, it also has `planId` and `messages`, the transcript so far.

```ts
import { ProviderError } from "@intentlock/guard";

try {
  await guard.run({ user, task });
} catch (err) {
  if (err instanceof ProviderError && err.retryable) scheduleRetry(err.planId);
  else throw err;
}
```

The built-in adapters already retry twice inside their SDKs. Whether to retry the whole run is up to you.
