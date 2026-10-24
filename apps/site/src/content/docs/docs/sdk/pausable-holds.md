---
title: Pause on a hold
description: Let a run stop while a hold waits for a person, and resume it from a webhook when the hold is resolved.
---

By default a held call waits: the process stays alive until an approver decides or `holdTimeoutMs` runs out. That is fine for a long-running service. For a CI job, a serverless function or anything that may restart, the run can **pause** instead: it saves a checkpoint and exits, and Intentlock calls your webhook when the hold is resolved so you can resume it.

Nothing about the decision changes. The hold is still created and resolved on the server, and resume only runs the exact call that was approved.

## How it fits together

1. `guard.run()` returns `status: "suspended"` with a `checkpoint` when a call is held. The other calls in that turn have already run.
2. You save the checkpoint in a `CheckpointStore` (a file or an S3-compatible bucket, optionally encrypted) and let the process exit.
3. An approver approves, rejects, or the hold expires. Intentlock posts a signed `hold.resolved` event to the agent's webhook URL, retrying for about four hours if your endpoint fails.
4. Your webhook handler verifies the signature, loads the checkpoint by `planId` and calls `guard.resume(checkpoint)`. The approved call runs, or the model is told it was rejected or timed out, and the loop continues.

## Turn it on

Set the webhook URL on the agent in the inbox (**Agents → your agent → Overview → Hold webhook**). Copy the signing secret it shows once and keep it with the agent's other secrets.

Then pause instead of waiting:

```ts title="agent.ts"
import { createGuard, FileCheckpointStore, HoldMode, RunStatus, toolset } from "@intentlock/guard";

const store = new FileCheckpointStore({
  dir: ".intentlock/checkpoints",
  encryptionKey: process.env.CHECKPOINT_KEY,
});

const pausing = createGuard({ provider, gate, ...toolset(tools), onHold: HoldMode.SUSPEND });

const result = await pausing.run({ user: "alice@acme.dev", task });
if (result.status === RunStatus.SUSPENDED && result.checkpoint) {
  await store.save(result.planId, result.checkpoint);
}
await gate.close();
```

Call `gate.close()` before the process exits so the audit entries written so far reach the server. `onHold: suspend` needs a gate that can look up holds: `HybridGate` or `HttpGate`.

## Resume from the webhook

```ts title="webhook.ts"
import { verifyWebhook, WEBHOOK_SIGNATURE_HEADER } from "@intentlock/core";
import { RunStatus } from "@intentlock/guard";

export async function onHoldResolved(body: string, headers: Headers) {
  const event = await verifyWebhook(
    process.env.INTENTLOCK_WEBHOOK_SECRET ?? "",
    body,
    headers.get(WEBHOOK_SIGNATURE_HEADER),
    new Date(),
  );
  if (!event) return 401;

  const checkpoint = await store.load(event.planId);
  if (!checkpoint) return 200;

  const result = await guard.resume(checkpoint);
  if (result.status === RunStatus.SUSPENDED && result.checkpoint) {
    await store.save(event.planId, result.checkpoint);
  } else {
    await store.delete(event.planId);
  }
  await gate.close();
  return 200;
}
```

`verifyWebhook` checks the HMAC signature and refuses events older than five minutes; it returns the parsed event or `null`. Answer with a 2xx status quickly. If your handler starts a longer job instead (a queue message, a CI workflow), answer first and resume in that job.

The same event can arrive twice (after a timeout on your side, for example). Each event has an `id` (also in the `intentlock-event-id` header). A second resume of a finished run finds no checkpoint, and a run that is still waiting on another hold in the same turn simply returns `suspended` again. Don't resume the same plan in two places at once: run resumes for one plan one after another (a queue, a lock, or a CI concurrency group keyed by `planId`).

### No webhook URL? Resume on a timer

The webhook only makes resuming fast. Without one, save checkpoints as above and call `guard.resume(checkpoint)` for each saved plan from a scheduled job (a cron every minute, for example). While the hold is pending it returns `suspended` and runs nothing; once it is resolved it continues.

### Agents that run in CI

A GitHub Actions job (or any CI) can't receive a webhook, so put a small relay in front of it: a serverless function that verifies the event with `verifyWebhook` and starts the resume job. For GitHub that is `POST /repos/{owner}/{repo}/dispatches` with `{ "event_type": "intentlock-hold-resolved", "client_payload": { "planId": … } }` and a token that may write the repository's contents. The workflow listens to `repository_dispatch`, reads `github.event.client_payload.planId`, loads the checkpoint from a bucket, resumes and deletes it, with `concurrency` keyed by the plan id. GitHub only starts `repository_dispatch` workflows on the default branch.

## Event format

```json
{
  "id": "4f0c…",
  "type": "hold.resolved",
  "at": "2026-10-23T10:00:00.000Z",
  "holdId": "cm…",
  "planId": "cm…",
  "agentId": "cm…",
  "status": "approved"
}
```

`status` is `approved`, `rejected` or `expired`. The `intentlock-signature` header is `t=<unix seconds>,v1=<base64url HMAC-SHA256 of "<t>.<body>">`. Every delivery attempt is written to the audit log as `hold_webhook` with its outcome (`delivered`, `retry`, `failed`).

## Checkpoint stores

A checkpoint holds the conversation so far (including tool outputs such as issue text or emails), the plan token and the held calls. It can be large, so it stays in your infrastructure: the Intentlock server never stores it.

| Store | Use it for |
| --- | --- |
| `FileCheckpointStore({ dir })` | One machine or a mounted volume. Files are written with mode `600`. |
| `S3CheckpointStore({ endpoint, region, bucket, accessKeyId, secretAccessKey })` | AWS S3, Cloudflare R2, MinIO, Supabase Storage or any S3-compatible bucket (path-style requests, Signature V4, no extra dependency). Keep the bucket private. |
| Your own | Implement `save`, `load` and `delete` from `CheckpointStore`. |

Both built-in stores take `encryptionKey`: 32 random bytes, base64 (`openssl rand -base64 32`). Checkpoints are then encrypted with AES-256-GCM and bound to their key, so an edited or swapped checkpoint fails to load. Delete checkpoints after resume and set a lifecycle rule on the bucket (the longest hold timeout plus a margin) for runs that are never resumed.

## What resume checks

- The checkpoint must match the hold: same plan, call id, tool and arguments as the server recorded when the hold was created. A checkpoint edited to run something else is refused with `CheckpointError` and nothing runs.
- The hold's status comes from the server, never from the checkpoint or the webhook body.
- If the plan token has expired or expires within a minute, it is refreshed (same plan only). Every later call goes through the normal checks.
- **Long holds:** the server refreshes a token at most 60 minutes after it expired, and tokens last 15 minutes. If a hold is resolved later than that, resume still settles the held call (the server confirmed the decision) but cannot refresh, so the run's later calls are blocked with `token_expired`. Keep hold timeouts under about an hour for runs that pause, or start a new run after a long hold.
- With `HybridGate`, the checkpoint also carries the gate's local state for the plan (audit chain position and per-step call counts), so the audit chain continues where it stopped.

`guard.execute()` (your own loop) always waits on holds; pausing is part of `run()`.
