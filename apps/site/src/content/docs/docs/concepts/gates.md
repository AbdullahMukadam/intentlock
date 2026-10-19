---
title: Hybrid and remote gates
description: Where decisions are made, and the trade-offs between hybrid and remote mode.
---

A gate is the part of the SDK that signs plans and checks calls. Where it makes the decision is the main choice you make when you deploy.

| | Hybrid (`HybridGate`) | Remote (`HttpGate`) |
| --- | --- | --- |
| Allow and block | In your process, against the signed token | On the server, every call |
| Holds | Server | Server |
| Audit | Local outbox file, uploaded in batches | Written by the server on each call |
| Network on allow or block | None | One request per call |
| Revocation | At the next token refresh (5 to 15 minutes) | Immediate |
| Call limits | Per process | Shared across processes |

## Hybrid mode (the default)

The token already carries the plan, the policy and the person's role, so `HybridGate` verifies the signature with the server's cached public keys and runs `check()` locally. Server load grows with plans signed, holds and audit batches, not with tool calls.

Every decision is appended and fsynced to the outbox before the tool runs or the block is returned. If the append fails, the call is blocked. A background worker uploads batches every 5 seconds and retries with backoff.

If the server falls behind (more than 500 unacknowledged entries, or the oldest older than 60 seconds), new calls are blocked with `audit_backlog` until it catches up. This bounds how long an agent can run without the server seeing its decisions. During a short outage, allow and block keep working until that limit; holds need the server and block.

## Remote mode

`HttpGate` sends every check to the server. Use it when you want instant revocation and shared call limits, or when you do not trust the host process: in hybrid mode a compromised host could skip local checks. The server's re-checks, the client hash chain and backpressure make that visible, not impossible.

## Other gates

- `LocalGate` decides in-process with a key and policy you give it. No server, no holds. For tests, evals and offline development.
- `PassThroughGate` allows everything. Only for unprotected baselines, never in production.

Options for each gate are on the [gates](/docs/sdk/gates/) page.
