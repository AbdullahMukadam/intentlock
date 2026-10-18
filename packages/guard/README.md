# @intentlock/guard

Provider-agnostic agent guard: LLMProvider interface, planner, guarded tool loop.

```ts
import { createGuard, defineTool, providerFromEnv, toolset } from "@intentlock/guard";
import { HybridGate } from "@intentlock/sdk";
import { z } from "zod";

const listIssues = defineTool({
  name: "list_issues",
  description: "List open issues",
  schema: z.object({ repo: z.string() }),
  impl: ({ repo }) => github.listIssues(repo),
});
const guard = createGuard({
  provider: providerFromEnv(),
  gate: new HybridGate({ baseUrl, apiKey }),
  ...toolset([listIssues]),
});
const result = await guard.run({
  user: "alice@acme-demo.dev",
  task: "Triage open issues in acme-demo/public-app",
});
```

`providerFromEnv()` reads `LLM_PROVIDER` (`openai-compatible` | `fake`), `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Import it from `@intentlock/anthropic` instead to also support `LLM_PROVIDER=anthropic`.

Every tool call is checked against the signed plan before it runs; blocked, rejected and failed calls come back to the model as error results. `guard.start()` + `guard.execute(session, toolCalls)` let you keep your own loop.

Full guide (options, explicit plans, policies, runtime behaviour): [Agent guard](https://github.com/AbdullahMukadam/intentlock/blob/main/apps/site/src/content/docs/docs/sdk/guard.md).

License: MIT. Part of [Intentlock](https://github.com/AbdullahMukadam/intentlock).
