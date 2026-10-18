---
title: Packages
description: The SDK packages, what each one is for, and how to install them.
sidebar:
  order: 1
---

| Package | License | What you use it for |
| --- | --- | --- |
| `@intentlock/guard` | MIT | The agent loop: plan, check, run tools, return results. Works with any LLM through `LLMProvider`. |
| `@intentlock/sdk` | MIT | Gates that talk to the server (`HybridGate`, `HttpGate`) or decide in-process (`LocalGate`). |
| `@intentlock/anthropic` | MIT | Optional adapter for Claude. |
| `@intentlock/core` | MIT | Plan and policy schemas, `parsePolicy`, `check()`, audit chain verification. Pure, no I/O. |
| `@intentlock/cli` | ELv2 | The `intentlock` command. See [CLI](/docs/reference/cli/). |

```bash
pnpm add @intentlock/guard @intentlock/sdk zod
pnpm add @intentlock/anthropic
```

The second line is only needed if you use Claude. The MIT packages are versioned together; `0.1.0` is the first npm release. Until it is on npm, depend on them from a clone of the repository (`workspace:*` or `pnpm link`).

Requires Node 22 or newer.

## Configuration

Your agent app needs two variables from the inbox (**Agents → API keys**) or `intentlock keys create`:

```bash title=".env"
INTENTLOCK_URL=https://intentlock.acme.dev/api
INTENTLOCK_API_KEY=il_live_...
```

An API key identifies one agent. Store it as a secret and create one key per environment (`production`, `staging`), so you can revoke one without touching the others.

## Next

- [Agent guard](/docs/sdk/guard/) if you want Intentlock to own the tool loop (recommended).
- [Gates](/docs/sdk/gates/) if you keep your own loop and call the gate yourself.
