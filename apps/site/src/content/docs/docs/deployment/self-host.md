---
title: Self-hosting
description: Run the server, inbox and Postgres for your team with the one-file Docker Compose bundle.
sidebar:
  order: 1
---

Intentlock runs as one deployment per team. The self-host bundle is a single Compose file with Postgres, the server, the inbox and nginx in front of them. The [quick start](/docs/quick-start/) uses the same bundle; this page covers a real install.

You need Docker with Compose v2.23 or newer and `openssl`.

## Install

```bash
BASE=https://raw.githubusercontent.com/AbdullahMukadam/intentlock/main/deploy
curl -fsSLO $BASE/docker-compose.selfhost.yml
curl -fsSL $BASE/selfhost.env.example -o .env
```

Edit `.env` before the first start:

- `ORG_NAME`, and `PUBLIC_URL` set to the `https://` address your team opens. Session cookies are then marked secure; invite links and OAuth callbacks use it.
- `SMTP_URL` and `SMTP_FROM` to email invites and enable "forgot password". Without them, links are only shown to copy.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for "Continue with Google" and "Continue with GitHub". Only existing and invited users can sign in this way, matched by verified email. Register the callback `<PUBLIC_URL>/api/v1/auth/oauth/<google|github>/callback`.
- `INTENTLOCK_VERSION` pinned to a release tag instead of `latest`.

Every variable is listed in [Environment variables](/docs/deployment/environment-variables/). Then add the two secrets and start:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
echo "SIGNING_KEY=\"$(openssl genpkey -algorithm ed25519)\"" >> .env
docker compose -f docker-compose.selfhost.yml up -d
docker compose -f docker-compose.selfhost.yml logs server | grep "setup code"
```

Open `PUBLIC_URL`, paste the setup code and create the first admin. Then invite your team, and create an agent and an API key for each agent app. Agent apps use `INTENTLOCK_URL=<PUBLIC_URL>/api`.

## How the bundle is laid out

nginx serves everything from one origin:

- `/api/v1/*` goes to the server's `/v1/*`.
- `/api/socket.io` goes to the server's WebSocket, for live holds and activity.
- Everything else goes to the inbox.

One origin means session cookies work with `SameSite=Lax`, there is no CORS, and the browser never talks to the server's port directly. nginx compresses API responses, and the server runs with `TRUST_PROXY=1` so rate limits and the audit log see the client's IP.

The images come from GHCR (`ghcr.io/abdullahmukadam/intentlock-server` and `intentlock-inbox`, tag `INTENTLOCK_VERSION`). The compose project is named `intentlock-selfhost`. To build the images from a clone instead:

```bash
docker compose -f deploy/docker-compose.selfhost.yml --env-file deploy/.env \
  up -d --build
```

## Your responsibilities

- **TLS** in front of port 8080 (`HTTP_PORT`).
- **Backups** of Postgres (the `pgdata` volume).
- **The signing key.** Keep `SIGNING_KEY` secret and backed up. Losing it invalidates every signed plan; leaking it lets anyone sign plans.

## Upgrading

Set `INTENTLOCK_VERSION` to a newer tag and run `up -d` again. Migrations run first as a one-off `migrate` service, before the server starts, and are backward compatible with the previous release.

## Rotating the signing key

Deploy with the new key in `SIGNING_KEY` and the old one in `SIGNING_KEY_PREVIOUS`. The server publishes both public keys, so tokens signed with the old one stay valid. After 60 minutes (the longest token lifetime) remove `SIGNING_KEY_PREVIOUS`.

## License file

Without a license you run the Community edition. To use one, put the file in `./license/` and set `LICENSE_FILE=/license/<file>`. See [Licensing](/docs/licensing/).

## More than one server instance

The server is stateless: counters use atomic SQL updates, holds move out of pending exactly once, and audit appends take a database lock. You can run several instances behind a load balancer against one Postgres. Live WebSocket events are not yet shared across instances, so either use sticky sessions or rely on the inbox's 10-second polling for new holds.
