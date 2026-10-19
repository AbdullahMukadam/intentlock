---
title: Holds
description: Calls that wait for a person to approve or reject them in the inbox.
---

A hold rule pauses a tool call until a person approves or rejects it. Use holds for risky writes: posting in public, sending messages, deleting, paying.

```yaml
- id: hold-comments
  match: { tool: github_post_comment }
  decision: hold
  approvers: { roles: [approver, admin] }
  timeoutSeconds: 300
```

## What happens

1. The call pauses and a hold appears in the inbox, live, for the people who may approve it.
2. An approver opens it and sees the agent, the person it acts for, the tool and its arguments.
3. **Approved:** the tool runs. **Rejected or timed out:** the model gets an error result telling it not to retry.

If the wait itself fails (the server is unreachable), the call does not run, the guard emits an `error` event, and the model is told the approval could not be confirmed.

## Who can approve

`approvers` takes at least one of:

- `roles`: anyone with one of these roles.
- `emails`: these specific people.
- `self: true`: the person the agent acts for may approve their own hold.

Without `self: true`, the requester can never approve their own hold, even as an admin. A policy with a hold rule nobody could approve is rejected when it is published.

Approvals only come from people signed in to the inbox. The approver is always the signed-in user. An agent's API key can never approve.

## Timeouts

`timeoutSeconds` (default 300, at most 86,400) is how long the hold stays open on the server. The guard also has its own `holdTimeoutMs` (default 300,000 ms); a call that waits longer counts as rejected. Holds that run out are marked expired, and a late approval on an expired hold fails cleanly.

## Gates and holds

Holds always need the server. `HybridGate` and `HttpGate` create them there; in hybrid mode the server re-runs the check and only creates the hold if it agrees. `LocalGate` has no server, so a hold rule blocks with `hold_requires_server`.
