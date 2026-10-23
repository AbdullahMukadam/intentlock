---
title: HTTP API
description: Every server route, who may call it, and what it does.
---

The SDK and the inbox use this API; you only need it to build your own client or tooling. Paths are relative to the server. Behind the self-host bundle the server is under `/api`, so `/v1/plans` is `https://intentlock.acme.dev/api/v1/plans`. Every path is defined once in `API_ENDPOINTS` in `@intentlock/core`.

## Authentication

There are two kinds of callers, never mixed:

- **Agent apps** send `Authorization: Bearer il_live_...`. The key identifies the agent.
- **People** use the session cookie set by sign-in, setup or an accepted invite. Requests other than `GET`, `HEAD` and `OPTIONS` must also send an `x-intentlock-csrf` header (any value).

Every route needs a session unless it is marked **public** or **API key** below. Read routes are scoped by role: members see only their own runs, holds and audit entries. Bodies are JSON and validated; errors come back as `{ statusCode, error }`, where `error` is a stable code such as `setup_complete`.

## Agent routes

API key.

| Method | Path | Body → response |
| --- | --- | --- |
| POST | `/v1/plans` | `{ plan }` → `{ planId, token, planHash, policyVersion, policyHash, expiresAt }`. The agent must be enabled and `plan.user` an active member. |
| POST | `/v1/plans/:id/refresh` | `{ token }` → `{ token, expiresAt }`. Same plan hash only. |
| POST | `/v1/check` | `{ token, call }` → decision. Remote mode; audits every decision and creates holds. |
| POST | `/v1/holds` | `{ token, call, ruleId }` → `{ holdId, approvers, timeoutSeconds }`. Hybrid mode; the server re-runs the check first. |
| GET | `/v1/holds/:id/wait?timeout=25` | → `{ status }`: `pending`, `approved`, `rejected` or `expired`. Long-poll, at most 25 seconds per request. |
| POST | `/v1/report` | `{ token, callId, outcome }` → `{ planStatus }`. `outcome` is `ok` or `error`. |
| POST | `/v1/audit/batch` | `{ planId, tokens, entries }` → `{ ackedThrough, rejected }`. Hybrid mode, at most 100 entries, idempotent on `(planId, clientSeq)`. |

## Holds

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/holds?status=pending` | Approvers see the holds they may approve; members see their own. |
| POST | `/v1/holds/:id/approve` | `{ note? }`. Session only. The approver is the signed-in user and must satisfy the hold's approvers. |
| POST | `/v1/holds/:id/reject` | `{ note? }`. Same rules as approve. |
| POST | `/v1/holds/resolve` | `{ ids, approve, note? }` with up to 100 hold ids. Session only. Each hold is approved or rejected on its own, with the same rules and its own audit entry; returns an outcome per id (approved, rejected, expired, already resolved, not allowed, not found). |

## Setup and sign-in

Public unless noted.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/setup/status` | `{ setupRequired }`. |
| POST | `/v1/setup` | `{ code, email, password, orgName? }`. Creates the first admin; 409 once one exists. |
| GET | `/v1/auth/methods` | Which sign-in methods are enabled. |
| POST | `/v1/auth/login` | `{ email, password }` or `{ email, token }` (CLI token). Rate-limited. |
| GET | `/v1/auth/oauth/:provider` | Starts Google or GitHub sign-in. |
| GET | `/v1/auth/oauth/:provider/callback` | OAuth callback. Existing users only, matched by verified email. |
| POST | `/v1/auth/password/forgot` | `{ email }` → 202. Only when SMTP is configured. |
| POST | `/v1/auth/password/reset` | `{ token, password }` → 204. Ends all the user's sessions. |
| POST | `/v1/auth/logout` | Session. |
| GET | `/v1/me` | Session. `{ email, role, groups }`. |

## Account

Session, for the signed-in user.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/account` | Profile, sign-in methods, CLI token status, `holdEmails`. |
| PATCH | `/v1/account` | `{ holdEmails }`. Turns your hold emails on or off. |
| POST | `/v1/account/password` | `{ currentPassword?, newPassword }`. Ends the other sessions. |
| GET, DELETE | `/v1/account/sessions` | List own sessions; DELETE signs out all others. |
| DELETE | `/v1/account/identities/:provider` | Unlinks Google or GitHub. 409 for the last sign-in method. |
| POST, DELETE | `/v1/account/cli-token` | Creates (shown once) or deletes the CLI token. |

## Team

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/users` | The team. |
| PATCH | `/v1/users/:email` | `{ role?, groups?, disabled?, label? }`. Admin. `label` (up to 24 characters, `null` clears it) is shown next to the person in the inbox and never changes a decision. |
| POST | `/v1/users/:email/reset-link` | Admin. 24 hours, single use. |
| GET, POST | `/v1/invites` | Pending invites; `{ email, role, groups? }` creates one. Admin. |
| DELETE | `/v1/invites/:id` | Revokes an invite. Admin. |
| POST | `/v1/invites/:id/resend` | New link and expiry. Admin. |
| POST | `/v1/invites/lookup` | `{ token }`. Public. |
| POST | `/v1/invites/accept` | `{ token, password }`. Public. Creates the user. |

## Agents and keys

| Method | Path | Notes |
| --- | --- | --- |
| GET, POST | `/v1/agents` | List; `{ name, description? }` creates one with the starter policy (admin). |
| GET, PATCH, DELETE | `/v1/agents/:id` | `{ name?, description?, disabled? }`. Changes are admin-only. |
| PUT, DELETE | `/v1/agents/:id/webhook` | `{ url }` sets the hold webhook and returns `{ url, secret }`, the signing secret shown once (a new one each time); DELETE removes it. Admin, audited. See [Pause on a hold](/docs/sdk/pausable-holds/). |
| GET, POST | `/v1/agents/:id/api-keys` | List; `{ name }` creates a key, shown once. Admin. |
| DELETE | `/v1/agents/:id/api-keys/:keyId` | Revokes a key. Admin. |

## Policies

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/agents/:id/policy` | `{ active, draft? }`. |
| GET | `/v1/agents/:id/policy/versions` | All versions. |
| GET | `/v1/agents/:id/policy/versions/:version` | One version with its source. |
| PUT | `/v1/agents/:id/policy/draft` | `{ source, baseVersion }`. Admin. |
| POST | `/v1/agents/:id/policy/validate` | `{ source }` → `{ ok, errors }`. |
| POST | `/v1/agents/:id/policy/test` | `{ source, calls?, replayLast? }`. Dry run; nothing is saved. |
| POST | `/v1/agents/:id/policy/publish` | `{ source, baseVersion, message }`. Admin. 409 if `baseVersion` is stale. |
| POST | `/v1/agents/:id/policy/rollback` | `{ toVersion, message }`. Admin. Creates a new version. |

## Activity and audit

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/runs` | Runs (plans) with decision counts. Filters: `agentId`, `user`, `status`, `cursor`. |
| GET | `/v1/runs/:planId` | Plan, policy version, decisions, holds and timing. |
| GET | `/v1/stats/overview` | Dashboard counts. Filters: `from`, `to`, `agentId`. |
| GET | `/v1/audit` | Entries with filters, newest first. `?page=N&limit=M` returns numbered pages with a `total`; without `page`, follow `nextCursor` with `?cursor=`. `?format=jsonl` exports. |
| GET | `/v1/audit/verify` | `{ ok, count, firstBrokenSeq?, flagged: { seq, flagged, planId }[] }`. Each verify is recorded in the chain as `audit_verified`. |
| GET | `/v1/audit/summary` | `{ count, head, oldest, retentionDays, lastVerified }`: chain size, latest entry (seq, hash, time), oldest entry kept, the license's retention days, and the last verification (when, by whom, result). |

## Server

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/license` | Edition and limits. |
| GET | `/v1/keys/jwks` | Public. The plan-signing public keys. |
| GET | `/health` | Public. The process is up. |
| GET | `/health/ready` | Public. The database is reachable and the signing key loaded. |

## Live events

A Socket.IO namespace `/events` on the path `/socket.io` (`/api/socket.io` behind the bundle). The handshake needs a session cookie. The server emits `hold.created`, `hold.resolved` and `decision`, filtered by what the connected user may see.
