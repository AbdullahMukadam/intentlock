# Changelog

Versions apply to the npm packages (`@intentlock/core`, `sdk`, `guard`, `anthropic`, from 0.2.0 `mcp-proxy`, and from 0.2.1 `cli`) and to the server and inbox Docker images, which are released together. To upgrade a self-hosted instance, set `INTENTLOCK_VERSION` to the new version and run `docker compose up -d` again; migrations run first, before the new server starts.

## Unreleased

## 0.4.0 · 2026-10-29

Intentlock is now sold as one paid license, priced per seat per year (ADR-082). Every feature stays in every install; without a license the server runs with the free limits. A license problem never turns off enforcement, holds or the audit log.

### Upgrade notes

- Three migrations (`license`, `license_notices`, `audit_purge_runs`) run before the new server starts, as usual
- Without a license, Activity, the audit pages and export, runs and stats now show the last **30 days** of history. Older entries are not deleted: they stay in the database, the chain verify still covers them, and a license shows them again
- The free limits are unchanged (5 users, 3 agents). Over a limit, existing users and agents keep working; only adding more is refused
- License keys from before 0.4.0 are not accepted (the format changed; none were sold)

### Added

- License page in the inbox (admins): mode, licensee, seats used and total, agents, history shown, expiry; paste or upload a key, verified on the server before it is saved; remove a license. Stored in the database, so every instance picks it up within an hour without a restart. `LICENSE_FILE` still works and takes precedence. New `GET/PUT/DELETE /v1/license`
- Seat licenses: a key sets the number of users, agents are unlimited, 365 days of history by default. Keys are checked offline; nothing phones home
- Expiry: banner for admins and an email 30, 7 and 1 days before the date; 14 days at full limits after it, then the free limits. Audit entries `license_applied`, `license_removed`, `license_expired`
- Limit errors say which limit was reached, the current count and how to apply a license
- Opt-in deletion of old audit entries (ADR-083): `AUDIT_DELETE_AFTER_DAYS` (at least 90) with `AUDIT_ARCHIVE_DIR` or `AUDIT_ARCHIVE_S3_*`. Entries are archived, read back and compared before they are deleted, the deletion is anchored in the chain (`audit_purged`), and verify starts from the first kept entry. Off by default; the server refuses to start with deletion on and no archive target
- `verifyChain(entries, { from })` and `signV4` (Signature V4 on WebCrypto) in `@intentlock/core`
- `intentlock audit verify --archive <files...>` checks archives together with an export; a windowed export is checked from its first entry

### Changed

- `S3CheckpointStore` in `@intentlock/guard` signs with the SigV4 implementation now in core; its behaviour is unchanged

## 0.3.1 · 2026-10-24

### Fixed

- `guard.resume()` refreshed the plan token every time; the server refuses refresh for a completed plan (409 `plan_not_active`), so a resume logged an error event although nothing failed (seen on the first live TriStack run). It now refreshes only when the token has expired or expires within a minute; later calls still refresh once on `token_expired`

## 0.3.0 · 2026-10-24

### Added

- Visual policy builder (ADR-081, free): a Form view next to the YAML editor in the inbox policy tab, one card per rule (tools, plan, user, every argument condition, except, decision, approvers and timeout), reorder by drag or arrows. Both views edit the same YAML; `policyToYaml` and `yamlExtras` in `@intentlock/core`
- Pausable holds (ADR-080): `createGuard({ onHold: HoldMode.SUSPEND })` makes `run()` return `suspended` with a checkpoint instead of waiting, and `guard.resume(checkpoint)` continues it after checking the hold's exact call with the server. `FileCheckpointStore` and `S3CheckpointStore` (any S3-compatible bucket, optional AES-256-GCM)
- Hold-resolved webhooks: set a URL per agent in the inbox (`PUT /v1/agents/:id/webhook`); approve, reject and expiry post a signed `hold.resolved` event, retried for about 4 hours, every attempt audited. `verifyWebhook` in `@intentlock/core`
- `GET /v1/holds/:id/wait` also returns the held call (`planId`, `callId`, `tool`, `args`); `timeout=0` answers at once
- `@intentlock/cli` is published to npm: `npm install -g @intentlock/cli`, or `npx -y @intentlock/cli audit verify --file intentlock-audit.jsonl` without installing (ADR-079)
- Inbox Audit page: chain size and head, oldest entry, retention, last verified and by whom, flagged entries linked to their runs, export and the offline verify command; new `GET /v1/audit/summary`, and each verify is recorded as `audit_verified` (ADR-078)
- Hold notifications (ADR-072): a new hold emails every member who may approve it (each can opt out in Account settings) and posts to `HOLD_WEBHOOK_URL` (Slack/Discord-compatible) if set; a failed send is audited and never changes the hold
- Holds: search, agent and state filters in the URL, and bulk approve/reject with per-hold results (`POST /v1/holds/resolve`, ADR-076)
- Delete an agent (ADR-075): archives it, revokes its keys, rejects its pending holds and frees its license slot; its history stays visible
- Member labels (ADR-073): an admin can tag a member (for example `bot`); display only, never a policy input
- Activity: numbered pages with a total count and page size, kept in the URL (ADR-074)
- Overview: stacked decision chart, hold outcomes and sparklines on shadcn charts (ADR-077)

### Changed

- Invite, password-reset and hold emails share one HTML layout with a plain-text part
- Destructive actions are confirmed in dialogs instead of browser pop-ups; the mobile menu is a sheet
- Tables stay tables on phones and scroll sideways inside their panel

### Fixed

- Inbox: Next.js 16.4.0 → 16.4.2 for a security advisory
- Inbox on phones: hold outcomes legend, policy tab (editor, publish, history buttons; stacked diff), API key form and one-time secret reveal
- Inbox: the Audit page showed its empty state after navigating back; some action buttons had no loading state

## 0.2.1 · 2026-10-19

### Fixed

- `HybridGate`: a check was blocked with `audit_write_failed` when an earlier call used a later plan step than any call before it (the per-step usage saved with the audit entry had gaps and failed validation). Found by the TriStack triage bot: every call after the first label in a turn was blocked
- `HybridGate`: after all required plan steps had run, later audit entries restarted at sequence 1; the server rejected them as conflicting and they were missing from the audit log. The outbox now keeps the chain head when it cleans up a finished plan

## 0.2.0 · 2026-10-19

### Added

- `intentlock-mcp` (`packages/mcp-proxy`): published to npm, guards any stdio MCP server with a plan file (`npx -y @intentlock/mcp-proxy --plan plan.json -- <server command>`); only planned tools are listed, every call is checked, holds return and are checked again when the call is repeated (ADR-070)
- Docs: "Protect your own agent" guide, policy templates (GitHub, email, payments, files, outbound HTTP), signing key backup and rotation
- Public website and docs (`apps/site`, Astro + Starlight); the inbox links to the docs when `NEXT_PUBLIC_DOCS_URL` is set
- Inbox: data is cached between pages and refreshed in the background, live updates invalidate the cache, sidebar pages are prefetched; the cache is cleared on sign-out and on 401
- Inbox: buttons show a loading state while their action runs
- Server: `Server-Timing` header on every response (total and database time)
- Each app loads its own `.env` file

### Changed

- Self-host bundle defaults to a pinned image tag instead of `latest`
- Guard: the planner sees each tool's argument names, so it pins scope on arguments that exist
- Server: the session check and its user load in one query; self-host nginx gzips API responses

### Fixed

- SDK errors show the HTTP status when the server sends no error code

## 0.1.0 · 2026-10-17

First release.

- Signed plans: an agent declares its plan, the server signs it (EdDSA JWS, 15 min TTL, JWKS), and every tool call is checked against the plan and the agent's policy: allow, block or hold
- Policies per agent, versioned and immutable: publish, rollback, test against sample calls or replayed traffic
- Holds: risky calls wait for a person to approve or reject in the inbox
- Tamper-evident audit log (hash chain), verified with `intentlock audit verify`
- Gates: `HybridGate` (local decisions, fsynced outbox), `HttpGate`, `LocalGate`
- Provider-agnostic guard (`createGuard()`), OpenAI-compatible and Anthropic adapters
- Inbox: sign-in (email/password, Google, GitHub), team and invites, agents and API keys, policy editor, runs and audit viewer
- Self-host bundle (`deploy/docker-compose.selfhost.yml`), fail closed everywhere
