---
title: Plans and tokens
description: How an agent declares a plan, and what the signed intent token carries.
sidebar:
  order: 1
---

## The plan

Before an agent touches any tool, it declares what it intends to do. A plan has a goal, the person the agent acts for, and up to 50 steps:

```json
{
  "version": 1,
  "goal": "Summarise open issues",
  "user": "alice@acme.dev",
  "steps": [
    {
      "tool": "github_list_issues",
      "args": { "repo": { "eq": "acme/public-app" } },
      "maxCalls": 3
    },
    { "tool": "github_get_issue", "args": { "repo": { "eq": "acme/public-app" } } }
  ]
}
```

| Step field | Default | Meaning |
| --- | --- | --- |
| `tool` | | Exact tool name, never a glob. Must match `^[a-zA-Z0-9_-]{1,64}$`. |
| `args` | none | Pinned arguments, one constraint each: `eq`, `in`, `glob`, `regex`, `lte` or `gte`. |
| `maxCalls` | `20` | How many times this step may run. |
| `required` | `false` | The step must run for the plan to complete. |

A call matches a step when the tool name is equal and every pinned argument satisfies its constraint. A pinned argument that is missing from the call does not match, so the call is blocked as `not_in_plan`. The constraint operators work as in [policies](/docs/reference/policy/#argument-conditions).

With the [agent guard](/docs/sdk/guard/), the model writes the plan itself through a built-in `declare_plan` tool, before it reads any tool output. Your app can also pass an [explicit plan](/docs/sdk/guard/#explicit-plans).

The plan's `user` must be an active member of your team. Plans for unknown or disabled users are refused.

## The intent token

`POST /v1/plans` returns a compact JWS signed with Ed25519. It is a signed bundle with everything a client needs to decide locally:

| Claim | Meaning |
| --- | --- |
| `sub` | The person's email. |
| `jti` | The plan id (a ULID). |
| `iat`, `exp` | Issued and expiry times. Default lifetime 15 minutes, at most 60. |
| `ph` | The plan hash: SHA-256 of the plan in canonical JSON (RFC 8785). |
| `plan` | The full plan. |
| `agent` | The agent that requested it, from its API key. |
| `pol`, `polv`, `polh` | The agent's active policy at signing time, its version number and hash. |
| `role`, `groups` | The person's role and groups at signing time. |
| `kid` (header) | The signing key id, for key rotation. |

Changing any byte breaks the signature, so a client cannot widen the plan or loosen the policy it was given. The server's public keys are published at `/v1/keys/jwks`.

## Refresh never widens

Tokens are short-lived on purpose. The guard refreshes an expired token with `POST /v1/plans/:id/refresh`, which re-signs the same plan hash with the agent's current policy. A refresh for a different plan is rejected. To do something the plan does not cover, the agent needs a new plan.

Because the policy is a snapshot, a policy change reaches running plans at their next refresh, at most one token lifetime later.
