# Changelog

Versions apply to the npm packages (`@intentlock/core`, `sdk`, `guard`, `anthropic` and, from 0.2.0, `mcp-proxy`) and to the server and inbox Docker images, which are released together. To upgrade a self-hosted instance, set `INTENTLOCK_VERSION` to the new version and run `docker compose up -d` again; migrations run first, before the new server starts.

## Unreleased

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
