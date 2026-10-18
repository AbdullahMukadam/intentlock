---
title: Security model
description: What Intentlock protects against, what it trusts, and its known limits.
---

## What it protects against

Intentlock stops an agent from doing things the person did not ask for, even when the model is convinced to try. The typical case is prompt injection: an issue, email or web page tells the agent to leak data or take an action outside the task. The plan is signed before the agent reads that content, so anything outside it is blocked, however convincing the text is. Policies add a second, independent layer that holds even when a plan is too broad.

It is not a prompt-injection detector. It does not inspect what the model writes, only which tools it calls and with which arguments.

## Guarantees

- **Fail closed.** A tool runs only on an explicit `allow`. Errors, timeouts, bad signatures, expired tokens and failed audit writes all block.
- **Plans cannot be widened.** The token is signed with Ed25519 and carries the plan, policy and role. Changing a byte breaks it. A refresh re-signs the same plan hash only.
- **Plans come before policies.** A policy cannot allow a call that is outside the plan.
- **Audit before acting.** In hybrid mode each decision is fsynced to the local outbox before the tool runs; if the write fails, the call is blocked. If uploads fall too far behind, calls are blocked.
- **People approve, agents do not.** Approvals need a signed-in person who satisfies the hold's approvers. An API key can never approve, and the requester cannot approve their own hold unless the rule says `self: true`.
- **Tamper-evident audit.** Every entry is hash-chained; editing or removing one in the middle breaks verification, online or offline.

## Accounts and access

- Accounts are invite-only. The plan's `user` must be an active member.
- Passwords are hashed with scrypt and must be at least 12 characters. Sign-in is rate-limited, and the same error is returned for an unknown email, a wrong password and a disabled user.
- Google and GitHub sign-in use the authorization code flow with PKCE, for existing users only, matched by verified email.
- Sessions are `httpOnly` cookies (`Secure` on https, `SameSite=Lax`, 12 hours sliding). Changing data also needs a custom header, which cross-site forms cannot send.
- Every route needs a session unless it is explicitly public (setup, sign-in, health, public keys) or an agent route (API key). Members see only their own runs.
- API keys are stored as hashes and shown once.

## What it trusts

- **The host process in hybrid mode.** Prompt injection cannot skip the guard, but a compromised host could skip checks altogether. Server re-checks, the client hash chain and backpressure make that visible, not impossible. Use `HttpGate` where the host is untrusted.
- **The signing key.** Anyone with `SIGNING_KEY` can sign plans. Keep it in a secret store.
- **An API key.** A stolen key lets someone run the agent as an existing user, within that user's policies. It cannot approve held actions. Revoke it with `intentlock keys revoke`.

## Known limits

- **Leaks through allowed content.** If posting a comment is allowed, the model can still write private data into it. Hold public writes.
- **Plans are only as narrow as their arguments.** An unpinned `path` or `label` lets an injection pick the value. The planner is told to pin scope arguments; policies can constrain them too.
- **Plans see arguments, not who asked.** A refund on a valid order requested by a third party looks legitimate. Route it to a hold.
- **Revocation latency in hybrid mode** is the token lifetime (5 to 15 minutes).
- **Fail closed means the agent stops** when it needs the server and the server is down.
- **Deleting the newest audit entries** is not detectable from the chain alone. Export it regularly.

## Operating checklist

- One agent per application, one API key per environment.
- `INTENTLOCK_API_KEY` stored as a secret and rotated by creating a new key, deploying, then revoking the old one.
- Policies start from `default: block` and end with `allow-in-plan`.
- Risky writes (posting, sending, deleting, paying) are `hold` rules.
- `outboxDir` on persistent disk, or `null` with the trade-off accepted.
- `gate.close()` runs on shutdown.
- Agent tests use `LocalGate` and `FakeProvider`.
- To stop an agent at once: `intentlock agents disable <name>`. Running plans end within their token lifetime.
