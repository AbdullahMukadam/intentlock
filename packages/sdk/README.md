# @intentlock/sdk

Gates for [Intentlock](https://github.com/AbdullahMukadam/intentgate): sign a plan, check each tool call against it, wait on holds, report outcomes.

| Gate              | Decisions                                                                                                    | Use when                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `HybridGate`      | Locally against the signed bundle; holds and batched audit via the server; outbox file fsynced before acting | Production default                                  |
| `HttpGate`        | On the server, every call                                                                                    | Instant revocation, shared counters, untrusted host |
| `LocalGate`       | In-process, holds block                                                                                      | Tests, evals, offline development                   |
| `PassThroughGate` | Allows everything                                                                                            | Unprotected baselines only                          |

```bash
pnpm add @intentlock/sdk
```

```ts
import { HybridGate } from "@intentlock/sdk";

const gate = new HybridGate({
  baseUrl: process.env.INTENTLOCK_URL!,
  apiKey: process.env.INTENTLOCK_API_KEY!,
});
const { token } = await gate.signPlan({
  version: 1,
  goal: "Triage issues",
  user: "alice@acme.dev",
  steps: [{ tool: "github_list_issues", args: { repo: { eq: "acme/public-app" } } }],
});
const decision = await gate.check(token, {
  tool: "github_list_issues",
  args: { repo: "acme/public-app" },
  callId: "c1",
});
await gate.close();
```

Run a tool only when `decision.verdict === "allow"`; every error path blocks. Most apps use [`@intentlock/guard`](https://www.npmjs.com/package/@intentlock/guard), which drives the gate for you. Options and runtime behaviour: [USAGE.md](https://github.com/AbdullahMukadam/intentgate/blob/main/docs/USAGE.md) §4.6 and §6.

License: MIT.
