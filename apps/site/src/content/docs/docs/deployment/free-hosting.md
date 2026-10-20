---
title: Free hosting
description: Run a small private instance on Vercel, Render and Neon free tiers, step by step.
---

For a demo or a small team you can run Intentlock on free tiers that need no credit card: Vercel for the inbox, Render for the server and Neon for Postgres. The instance is still private: every page needs sign-in.

Traffic goes browser → Vercel (the inbox, with `/api/*` rewritten to Render) → Render (the server) → Neon. The browser only talks to the Vercel origin, so cookies are first-party and no CORS is needed. Agent apps use the same `https://<vercel-domain>/api` URL.

## What the free tiers mean

| Part | Service | Plan for |
| --- | --- | --- |
| Server | Render free web service (Docker) | Sleeps after 15 minutes without traffic; waking takes about a minute. 750 instance hours a month per workspace. Single instance, ephemeral disk. |
| Database | Neon free Postgres | 0.5 GB storage and 100 compute hours a month. Scales to zero after 5 idle minutes, so the first query afterwards is about a second slower. No backups. |
| Inbox | Vercel Hobby | Personal, non-commercial use. Rewrites do not proxy WebSockets, so the inbox polls for new holds every 10 seconds. |

Avoid Render's free Postgres: it is deleted after 30 days. Limits change often, so check them before you deploy.

## Steps

1. **Images.** The server image is public at `ghcr.io/abdullahmukadam/intentlock-server:latest`. If you build your own, make the GHCR package public so Render can pull it.
2. **Neon.** Create a project in the region closest to the Render region you will pick. Copy two connection strings: the pooled one (its host contains `-pooler`) and the direct one.
3. **Migrate once.** From a clone of the repository, with the direct string:
   ```bash
   export DIRECT_URL='<direct connection string>'
   pnpm --filter @intentlock/server exec prisma migrate deploy
   ```
   In Windows PowerShell, set it with `$env:DIRECT_URL = '<direct connection string>'` instead. Run it again after each upgrade.
4. **Signing key.** Build the CLI and create a key:
   ```bash
   pnpm --filter @intentlock/cli build
   node packages/cli/dist/bin.js keygen --env
   ```
   Paste the value between the quotes of the printed `SIGNING_KEY="…"` into Render. Keep a copy in a password manager and delete `./keys/`.
5. **Render.** New → Web Service → existing image `ghcr.io/abdullahmukadam/intentlock-server:latest`, free instance, health check path `/health/ready`, with the variables below. Note the service URL, `https://<name>.onrender.com`.
6. **Vercel.** Import the repository with root directory `apps/inbox`, framework Next.js, and build command `cd ../.. && pnpm turbo run build --filter=@intentlock/inbox`. Set `API_URL=https://<name>.onrender.com` for Production; it is read at build time, so redeploy after changing it. Under Deployment Protection, turn Vercel Authentication off: Intentlock has its own sign-in, and agents call `/api` without a Vercel login. Use the production domain, not a per-deployment URL.
7. **Point the server at the inbox.** Set `PUBLIC_URL` on Render to the Vercel production domain and redeploy.
8. **First admin.** Open `https://<name>.onrender.com/health/ready` to wake the server, copy `One-time setup code: …` from Render's logs, then open the Vercel domain and create the admin.
9. **Check.** Signed out, every inbox page redirects to sign-in. **Audit → Verify** is OK. **Account → Sessions** shows your own IP; if it shows a Vercel or Render address, adjust `TRUST_PROXY`.
10. **Keep the server awake.** Create a free HTTP monitor (UptimeRobot or cron-job.org) that sends `GET https://<name>.onrender.com/health` every 5 minutes. Use `/health`, not `/health/ready`: it does not touch the database, so Neon still scales to zero and stays within its compute hours. The always-on instance uses about 744 of the 750 free hours, so it must be the only free Render service in that workspace.

Keep Vercel, Render and Neon in one region (for example Vercel `sin1`, Render Singapore, Neon `ap-southeast-1`). The inbox pins its functions to `sin1` in `apps/inbox/vercel.json`; change all three together.

## Render variables

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled string. |
| `SIGNING_KEY` | The one-line key from step 4. |
| `PUBLIC_URL` | The Vercel production domain (step 7). |
| `ORG_NAME` | Your team's name. |
| `TRUST_PROXY` | `2`: Vercel's proxy, then Render's. Confirm with step 9. |
| `DATABASE_POOL_MAX` | `5`. |
| `API_KEY_PEPPER` | Optional. A long random string, set once. |
| `GOOGLE_*`, `GITHUB_*` | Optional. Callback `<PUBLIC_URL>/api/v1/auth/oauth/<google\|github>/callback`. |
| `SMTP_URL`, `SMTP_FROM` | Optional. Otherwise copy invite and reset links by hand, and there are no hold emails. Render's free tier blocks SMTP ports 25, 465 and 587, so use a provider on port 2525, for example Brevo (see [Environment variables](/docs/deployment/environment-variables/)). |
| `HOLD_WEBHOOK_URL` | Optional. A Slack or Discord webhook for new holds. It works over HTTPS, so Render's port block does not affect it. |

Not needed on Render: `DIRECT_URL` (migrations run from a clone or CI), `CORS_ORIGINS` (one origin through the rewrite) and `LICENSE_FILE` (Community edition).
