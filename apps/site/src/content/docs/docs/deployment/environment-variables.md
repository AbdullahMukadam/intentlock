---
title: Environment variables
description: Every environment variable the server, the inbox, the self-host bundle and your agent app read.
---

All configuration comes from environment variables. The server validates them at boot and refuses to start on invalid values.

## Server

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | | Required. Postgres URL; the pooled one in production. |
| `DIRECT_URL` | | Direct, non-pooled URL used by `prisma migrate deploy`. Not needed at runtime. |
| `SIGNING_KEY` | | Ed25519 private key, PKCS8 PEM. The same value on every instance. Keep it in a secret store. Required in production; in development a key is generated and printed. |
| `SIGNING_KEY_PREVIOUS` | | The old key during rotation; its public key stays published. |
| `PUBLIC_URL` | `http://localhost:3000` | The address people open. Used for cookies, invite and reset links and OAuth callbacks (`PUBLIC_URL/api/v1/auth/oauth/<provider>/callback`). |
| `ORG_NAME` | `Intentlock` | Name of the organization created on first boot. The setup page can rename it. |
| `PORT` | `3000` | Port the server listens on. |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the server: `1` behind the bundled nginx. Never more than the real number, or clients can spoof their IP. |
| `API_KEY_PEPPER` | empty | Extra secret mixed into API key hashes. Changing it invalidates every API key. |
| `CORS_ORIGINS` | | Only if the inbox is served from another origin. Avoid it; use one origin. |
| `LICENSE_FILE` | | Path to a license file. Unset means Community edition. |
| `SMTP_URL` | | For example `smtps://user:pass@smtp.example.com:465`. Set: invite and reset links are emailed and "forgot password" appears. Unset: links are only shown to copy. |
| `SMTP_FROM` | | Sender, for example `Intentlock <intentlock@acme.dev>`. Required with `SMTP_URL`. |
| `HOLD_WEBHOOK_URL` | | Optional `https://` Slack or Discord incoming webhook. Each new hold is posted with the agent, person, tool and argument names, but never argument values. |

With SMTP set, every new hold is also emailed to the team members who may approve it, including the arguments cut to 500 characters. Each person can turn these emails off on their Account page. A failed send is retried once, and if it still fails it is audited as `hold_notify_failed`. Holds and tool calls never wait for a notification.

**Brevo example.** Brevo's free plan works with Render's free tier, which blocks outbound SMTP ports 25, 465 and 587. Use port 2525, the login shown under *SMTP & API → SMTP*, and an SMTP key (not an API key). Write the `@` in the login as `%40`:

```bash
SMTP_URL=smtp://9a1b2c001%40smtp-brevo.com:<smtp-key>@smtp-relay.brevo.com:2525
SMTP_FROM="Intentlock <intentlock@your-domain.dev>"
```

The `SMTP_FROM` address must be a sender or domain you verified in Brevo.
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | | Both set: "Continue with Google". OAuth client type "Web application". |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | | Both set: "Continue with GitHub". |
| `DATABASE_POOL_MAX` | `10` | Connections per instance. Instances times this must stay under the database's connection limit. |
| `DATABASE_POOL_TIMEOUT_MS` | `5000` | How long a query waits for a free connection before the request answers 503. |
| `DATABASE_TX_MAX_WAIT_MS` | `2000` | How long a transaction waits to start before answering 503. |
| `DATABASE_TX_TIMEOUT_MS` | `5000` | How long a transaction may run before answering 503. |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `NODE_ENV` | `development` | `production` in deployments. |
| `INTENTLOCK_DEMO` | `0` | `1`: completing setup also creates sample users with printed passwords. Never in a real install. |

## Inbox

| Variable | Default | Notes |
| --- | --- | --- |
| `API_URL` | `http://localhost:3000` | The server's address behind the inbox's `/api/*` rewrite. Read at build time. |
| `DEMO_RUNNER_URL` | `http://localhost:8790` | The local demo runner behind `/demo-runner/*`. Development and recording only. |
| `NEXT_PUBLIC_DOCS_URL` | | An http(s) URL for a "Docs" link in the sidebar. Read at build time. Unset hides the link. |

## Self-host bundle

These are read by `docker-compose.selfhost.yml` from `.env`, next to the server variables above.

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | | Required. Password of the bundled Postgres. |
| `HTTP_PORT` | `8080` | Port nginx listens on. |
| `INTENTLOCK_VERSION` | the bundle's release (`0.3.1`) | Image tag to run. Change it to upgrade. |

The bundle sets `DATABASE_URL`, `DIRECT_URL` and `TRUST_PROXY` itself.

## Your agent app

| Variable | Notes |
| --- | --- |
| `INTENTLOCK_URL` | The server's API address, for example `https://intentlock.acme.dev/api`. |
| `INTENTLOCK_API_KEY` | The agent's API key (`il_live_...`). |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Read by `providerFromEnv()`. See [LLM providers](/docs/sdk/providers/). |

Model keys and other secrets of your agent never go to the Intentlock server. The repository's demo agents and evals also read `LLM_*` and `GITHUB_TOKEN`, locally only.
