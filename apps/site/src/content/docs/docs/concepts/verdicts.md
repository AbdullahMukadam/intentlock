---
title: Verdicts
description: How a tool call becomes allow, block or hold, and every block reason.
---

Every tool call gets exactly one verdict: `allow`, `block` or `hold`.

## The decision order

1. **Token.** The signature must be valid and the token not expired (30 seconds of clock leeway). Otherwise `invalid_token` or `token_expired`.
2. **Plan.** The call must match a step of the signed plan. Otherwise `not_in_plan`.
3. **Limits.** The step's `maxCalls` must not be used up. Otherwise `call_limit`.
4. **Policy.** Rules are evaluated in order; the first match decides. No match is `no_matching_rule`.

The plan checks run before the policy, so a policy can never allow a call that is outside the plan. Any error anywhere is a block with `internal_error`.

The same pure `check()` function from `@intentlock/core` runs on the server and in the client, so any decision can be recomputed later from its signed token.

## Fail closed

A tool runs only on an explicit `allow`. An error, a timeout, a missing decision, a bad signature, an expired token that cannot be refreshed, or an audit write that fails: each of these is a block.

## Block reasons

When a call is blocked, the model receives an error result instead of the tool output, for example:

```txt
Blocked by Intentlock (not_in_plan): ...
This action is outside what the user asked for.
```

| Reason | Meaning |
| --- | --- |
| `not_in_plan` | The tool or its arguments are not in the signed plan. Typical for prompt injection. |
| `call_limit` | The step's `maxCalls` was used up. |
| `no_matching_rule` | No rule matched, so `default: block` applied. |
| a rule id | A `block` rule matched. Its `reason` is included. |
| `invalid_token` | The token signature did not verify. |
| `token_expired` | The guard refreshes it automatically; blocks only if the refresh fails. |
| `invalid_call` | The call itself was malformed. |
| `internal_error` | Something threw while deciding. |
| `server_unavailable` | The server was needed but unreachable (network error, timeout or 5xx). |
| `api_key_rejected` | The server answered 401: the API key is unknown or revoked, or the agent is disabled. |
| `gate_rejected` | The server refused with another 4xx; the guard's `error` event has its error code. |
| `audit_write_failed` | The decision could not be written to the local outbox. |
| `audit_backlog` | The server has fallen too far behind on audit uploads. |
| `hold_requires_server` | A hold rule matched, but the gate has no server (`LocalGate`). |
| `unknown_tool`, `invalid_args` | The model called a tool you did not register, or with arguments your schema rejects. |

## Holds

A `hold` verdict pauses the call until a person decides. See [Holds](/docs/concepts/holds/).
