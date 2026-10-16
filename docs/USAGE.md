# Usage — adding Intentlock to your agent

This guide is for a team that already has (or is building) an LLM agent that calls tools, and wants every tool call checked before it runs. It covers the one-time setup, wiring the SDK into your code, writing a policy, and what to expect at runtime.

For how it works inside, see [`ARCHITECTURE.md`](ARCHITECTURE.md). For running the server in production, see [`DEPLOYMENT.md`](DEPLOYMENT.md) §10.

## 1. The model in one minute

1. Your agent receives a task for a person on your team (`alice@acme.dev`).
2. Before touching any tool, the agent **declares a plan**: which tools it intends to call, optionally with pinned arguments.
3. Intentlock **signs** the plan together with your agent's active policy.
4. Every tool call the model makes is **checked** against that signed plan and policy:
   - `allow` → the tool runs.
   - `block` → the tool does not run; the model gets an error result explaining why.
   - `hold` → a human approves or rejects it in the inbox; the call waits.
5. Every decision is written to a tamper-evident **audit log** you can view in the inbox and verify offline.

If anything goes wrong (server down, bad token, audit write fails), the call is blocked. Tools only run on an explicit `allow`.

## 2. Packages

| Package | License | What you use it for |
| --- | --- | --- |
| `@intentlock/guard` | MIT | The agent loop: plan, check, run tools, return results. Works with any LLM via `LLMProvider`. |
| `@intentlock/sdk` | MIT | Gates that talk to the server (`HybridGate`, `HttpGate`) or run in-process (`LocalGate`). |
| `@intentlock/anthropic` | MIT | Optional Anthropic adapter (`LLM_PROVIDER=anthropic`). |
| `@intentlock/core` | MIT | Plan/policy schemas and `parsePolicy`, if you need them directly. |
| `@intentlock/cli` | ELv2 | `intentlock` command: users, agents, API keys, policies, audit verify. |

```bash
pnpm add @intentlock/guard @intentlock/sdk zod
pnpm add @intentlock/anthropic      # only if you use Claude
```

The MIT packages are published to npm at `0.1.0` (Phase 6); until then, depend on them from a clone of this repo (`workspace:*` or `pnpm link`). The CLI is not published to npm in v0.1; build and link it from a clone:

```bash
pnpm install && pnpm --filter @intentlock/cli build
cd packages/cli && pnpm link --global       # puts `intentlock` on your PATH
```

Requires Node ≥ 22.

## 3. One-time setup

### 3.1 Run the server

Self-host the server, inbox and Postgres with the compose bundle `deploy/docker-compose.selfhost.yml` (step by step in the root [README](../README.md#60-second-quickstart); details in [`DEPLOYMENT.md`](DEPLOYMENT.md) §10). On first boot the server prints a one-time **setup code** to its logs (`docker compose logs server | grep "setup code"`). Open the inbox, which shows the setup page, paste the code and create the first admin with your email and a password.

### 3.2 Invite your team

Accounts are invite-only. In the inbox, **Team → Invite** takes an email, a role and optional groups and gives you a link to send (valid 7 days, single use). With `SMTP_URL` set it is also emailed. The person opens the link and sets a password, or continues with Google or GitHub if the server has them configured and the account's verified email is the invited one. The same from the CLI:

```bash
intentlock login --url https://intentlock.acme.dev/api --email admin@acme.dev   # prompts for the password
intentlock users invite alice@acme.dev --role member
intentlock users invite bob@acme.dev --role approver --groups oncall
intentlock users reset-link alice@acme.dev     # if Alice forgets her password
```

Roles: `admin` (manage everything), `approver` (approve holds), `member` (sees only their own runs). Groups are free-form labels you can match in policies.

Every person an agent acts for must be an active user here. Plans for unknown users are refused.

People who sign in only with Google or GitHub create a **CLI token** under **Account settings** and use `intentlock login --token`.

### 3.3 Register your agent and create an API key

One agent = one application (a GitHub triage bot, a support assistant). Not one per person or per server.

```bash
intentlock agents create github-assistant --description "Triages issues in our public repo"
intentlock keys create --agent github-assistant --name production
# INTENTLOCK_API_KEY=il_live_...   (shown once)
```

You can do the same in the inbox under **Agents**. A new agent starts with the starter policy: block everything except calls that are in the signed plan.

Put the key in your agent app's environment, never in code:

```bash
INTENTLOCK_URL=https://intentlock.acme.dev/api
INTENTLOCK_API_KEY=il_live_...
```

## 4. Wire it into your agent

### 4.1 With the guard (recommended)

The guard owns the tool loop. You give it a provider, a gate and your tools.

```ts
import { createGuard, defineTool, providerFromEnv, RunStatus, toolset } from "@intentlock/guard";
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

What happens in `run()`:

1. The model is asked to call a built-in `declare_plan` tool with the steps it needs (only your tools are allowed).
2. The plan is signed by the server.
3. The normal tool loop runs. Each call is checked; allowed calls run your `impl`, everything else returns an error result to the model so it can continue or stop.
4. The loop ends when the model stops calling tools (`completed`) or after `maxTurns` (`max_turns`, default 20).

**Tool rules**

- Names must match `^[a-zA-Z0-9_-]{1,64}$` (no dots). `declare_plan` is reserved.
- `defineTool` validates arguments with your zod schema before `impl` runs; invalid arguments come back to the model as an error.
- If `impl` throws, the model gets `Tool failed: <message>` and the outcome is recorded in the audit log.

### 4.2 Guard options

| Option | Default | Notes |
| --- | --- | --- |
| `provider` | — | Any `LLMProvider` (see §4.4). |
| `gate` | — | `HybridGate`, `HttpGate`, `LocalGate` (see §6). |
| `tools`, `impls` | — | Use `...toolset([...])`. |
| `planSource` | `planner` | `explicit` = you pass `steps` to `run()` instead of letting the model plan. |
| `holdTimeoutMs` | 300 000 | How long a held call waits for approval before it counts as rejected. |
| `maxTurns` | 20 | Model turns after the plan is signed. |
| `system`, `maxTokens` | — | Passed to the provider. |
| `onEvent` | — | Receives `plan_signed`, `allow`, `block`, `hold`, `approved`, `rejected`, `timeout`, `error`. Exceptions in it are swallowed. |

### 4.3 Explicit plans

If your app already knows what the agent is allowed to do, skip the model planner and pin it:

```ts
import { PlanSource } from "@intentlock/guard";

const guard = createGuard({ provider, gate, ...toolset(tools), planSource: PlanSource.EXPLICIT });

await guard.run({
  user: "alice@acme.dev",
  task: "Summarise open issues in acme/public-app",
  goal: "Summarise issues",
  steps: [
    { tool: "github_list_issues", args: { repo: { eq: "acme/public-app" } }, maxCalls: 3 },
    { tool: "github_get_issue", args: { repo: { eq: "acme/public-app" } } },
  ],
});
```

Step fields: `tool` (exact name), `args` (per-argument `eq | in | glob | regex | lte | gte`), `maxCalls` (default 20), `required` (default false). A call whose pinned argument is missing or different is `not_in_plan`.

### 4.4 Choosing the LLM

`providerFromEnv()` reads:

```bash
LLM_PROVIDER=openai-compatible      # or: fake, anthropic (with @intentlock/anthropic)
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=...
LLM_MODEL=gpt-4o-mini
```

Any OpenAI-compatible endpoint works (OpenAI, Gemini's OpenAI endpoint, Groq, Ollama at `http://localhost:11434/v1`). For Claude, import `providerFromEnv` from `@intentlock/anthropic` instead, or construct providers directly:

```ts
import { OpenAICompatibleProvider } from "@intentlock/guard";
import { AnthropicProvider } from "@intentlock/anthropic";

new OpenAICompatibleProvider({ baseURL, apiKey, model });
new AnthropicProvider({ apiKey, model: "claude-sonnet-5-5" });
```

To use another SDK, implement `LLMProvider` (`name` + `chat(request)`), mapping its tool-call format to `ToolCallReq` / `ToolResult`, and its errors with `toProviderError(name, err)`.

If the model call fails (rate limit, outage, bad key), `run()` rejects with a `ProviderError`: `provider`, `status` (HTTP status or `null` for a network error), `retryable` (network errors, 408, 409, 429 and 5xx), and, when it happened after the plan was signed, `planId` and `messages` (the transcript so far). The guard also emits an `error` event. The built-in adapters already retry twice inside their SDKs; whether to retry the whole run is your call.

```ts
import { ProviderError } from "@intentlock/guard";

try {
  await guard.run({ user, task });
} catch (err) {
  if (err instanceof ProviderError && err.retryable) scheduleRetry(err.planId);
  else throw err;
}
```

### 4.5 Keeping your own loop

If you already have an agent loop (LangChain, your own code), use the guard only for planning and checking:

```ts
const session = await guard.start({ user: "alice@acme.dev", task });

// ...your loop calls the model; when it returns tool calls:
const results = await guard.execute(session, toolCalls);   // [{ callId, content, isError }]
// feed results back to the model, one per tool call
```

`execute` checks each call, waits on holds, runs allowed `impl`s, refreshes an expired token, and always returns exactly one result per call.

### 4.6 Using a gate directly

Without the guard, call the gate yourself. You are then responsible for running the tool only on `allow`:

```ts
import { ReportOutcome } from "@intentlock/core";

const { token } = await gate.signPlan({
  version: 1,
  goal: "Triage issues",
  user: "alice@acme.dev",
  steps: [{ tool: "github_list_issues" }],
});

const decision = await gate.check(token, { tool: "github_list_issues", args: { repo }, callId: "c1" });
if (decision.verdict === "allow") {
  await listIssues(repo);
  await gate.report(token, "c1", ReportOutcome.OK);
} else if (decision.verdict === "hold") {
  const outcome = await gate.waitForHold(decision.holdId, { timeoutMs: 300_000 });
  // run only if outcome === "approved"
}
```

## 5. Writing your agent's policy

Policies are YAML, one per agent, versioned on the server. Edit them in the inbox (**Agents → your agent → Policy**) with live validation, dry-run testing and diff, or keep them in Git and use the CLI.

```yaml
version: 1
default: block
rules:
  - id: only-public-repo
    match: { tool: "github_*", args: { repo: { notGlob: "acme/public-app" } } }
    decision: block
    reason: Only acme/public-app is in scope

  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver, admin] }
    timeoutSeconds: 300

  - id: interns-read-only
    match: { tool: "github_*", user: { group: intern } }
    except: { tool: [github_list_issues, github_get_issue] }
    decision: block

  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

- Rules are evaluated in order; the first match wins. No match → `default: block`.
- `match` / `except` fields: `tool` (glob or list), `args` (`eq | in | notIn | glob | notGlob | regex | lte | gte`), `user` (`email` glob, `role`, `group`), `inPlan`.
- `notIn` / `notGlob` also match when the argument is missing, which is the safe outcome for block rules.
- Hold rules need at least one approver (`roles`, `emails`, or `self: true`). Without `self`, the person the agent acts for cannot approve their own hold.
- Keep `allow-in-plan` last unless you want to allow calls outside the plan.

Git workflow:

```bash
intentlock policy validate policy.yaml                       # offline syntax check
intentlock policy pull --agent github-assistant --out policy.yaml
intentlock policy test --agent github-assistant policy.yaml --replay 50
intentlock policy push --agent github-assistant policy.yaml -m "hold comments"
```

Publishing creates a new immutable version. New plans use it immediately; running plans keep the version they were signed with until their token expires (5–15 min). Rollback creates a new version copying an old one.

## 6. Picking a gate

| Gate | Decisions | Holds | Audit | Use when |
| --- | --- | --- | --- | --- |
| `HybridGate` | Locally, against the signed plan | Server | Local outbox file, uploaded in batches | **Production default.** No network hop on allow/block. |
| `HttpGate` | Server, every call | Server | Per call | You want instant revocation and shared counters. |
| `LocalGate` | In-process | Blocked | In memory | Unit tests, evals, offline dev. |
| `PassThroughGate` | Allows everything | — | — | Unprotected baselines only. Never in production. |

`HybridGate` options worth knowing:

| Option | Default | Notes |
| --- | --- | --- |
| `outboxDir` | `.intentlock/outbox` | Must be writable and survive restarts. `null` = in-memory (serverless; a crash can lose that request's entries). |
| `flushIntervalMs` | 5 000 | Upload interval. |
| `maxUnacked` / `maxUnackedAgeMs` | 500 / 60 000 | If the server falls this far behind, calls block with `audit_backlog`. |
| `handleSignals` | `true` | Flushes on `SIGTERM` / `SIGINT`. |
| `onError` | — | Called with background errors: upload failures (retried with backoff), JWKS reload, hold-wait retries, and outbox lines or files that could not be recovered after a restart. |

Call `gate.close()` when your process is done so the outbox flushes.

### Testing without a server

```ts
import { FakeProvider } from "@intentlock/guard";
import { generateSigningKeyPair, parsePolicy } from "@intentlock/core";
import { LocalGate } from "@intentlock/sdk";

const parsed = parsePolicy(readFileSync("policy.yaml", "utf8"));
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));

const gate = new LocalGate({
  privateKey: (await generateSigningKeyPair()).privateKey,
  policies: parsed.policy,
  users: { "alice@acme.dev": { role: "member" } },
});
```

`FakeProvider` replays scripted model turns, so your agent tests need no LLM key. See `packages/sdk/examples/local.ts` for a runnable example.

## 7. What happens at runtime

### Blocked calls

The model receives an error result such as:

```
Blocked by Intentlock (not_in_plan): ... This action is outside what the user asked for.
```

Common reasons:

| Reason | Meaning |
| --- | --- |
| `not_in_plan` | Tool or arguments are not in the signed plan (typical for prompt injection). |
| `call_limit` | The step's `maxCalls` was used up. |
| `no_matching_rule` | No rule matched; `default: block`. |
| *rule id* | A `block` rule matched; its `reason` is included. |
| `token_expired` | Refreshed automatically by the guard; blocks only if refresh fails. |
| `server_unavailable` | Could not reach the server when it was needed (network error, timeout or 5xx). |
| `api_key_rejected` | The server answered 401: the API key is unknown or revoked, or the agent is disabled. |
| `gate_rejected` | The server refused the check with another 4xx; the guard's `error` event has the server's error code. |
| `audit_write_failed` / `audit_backlog` | The decision could not be made durable. |
| `unknown_tool` / `invalid_args` | The model called a tool you did not register, or with bad arguments. |

### Held calls

1. The call pauses and a hold appears in the inbox (live) for eligible approvers.
2. An approver opens it, sees the agent, the person, the tool and arguments, and approves or rejects.
3. Approved → the tool runs. Rejected or timed out → the model gets an error telling it not to retry. If the wait itself fails (server unreachable), the call does not run, the guard emits an `error` event with the cause, and the model is told the approval could not be confirmed.

Approvals only come from signed-in people in the inbox; an agent's API key can never approve.

### Audit

- **Inbox → Activity** lists every decision (filter by agent, user, tool, verdict, rule); click a run for its plan, policy version and each call's outcome. Members see only their own runs.
- **Inbox → Audit** verifies the chain on the server. To verify offline, export it as an admin (a member's export holds only their own entries, which is not a complete chain):

```bash
curl -b cookies.txt "https://intentlock.acme.dev/api/v1/audit?format=jsonl" > audit.jsonl
intentlock audit verify --file audit.jsonl
```

## 8. Operating checklist

- [ ] One agent per application, one API key per environment (`production`, `staging`).
- [ ] `INTENTLOCK_API_KEY` stored as a secret; rotate by creating a new key, deploying, then `intentlock keys revoke <keyId> --agent <name>` (ids from `intentlock keys list --agent <name>`).
- [ ] Policy starts from `default: block` and ends with `allow-in-plan`.
- [ ] Risky write actions (posting, sending, deleting, paying) are `hold` rules.
- [ ] `outboxDir` is on persistent disk (or `null` with the trade-off accepted).
- [ ] `gate.close()` runs on shutdown.
- [ ] Agent tests use `LocalGate` + `FakeProvider`.
- [ ] To stop an agent immediately: `intentlock agents disable github-assistant` (running plans end within their token TTL).
