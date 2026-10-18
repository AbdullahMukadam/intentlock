---
title: Quick start
description: Run Intentlock with the self-host bundle, create the first admin and connect your first agent.
---

This runs Postgres, the server, the inbox and nginx on `http://localhost:8080`. You need Docker with Compose v2.23 or newer and `openssl`.

## 1. Start the bundle

```bash
mkdir intentlock && cd intentlock
BASE=https://raw.githubusercontent.com/AbdullahMukadam/intentlock/main/deploy
curl -fsSLO $BASE/docker-compose.selfhost.yml
curl -fsSL $BASE/selfhost.env.example -o .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
echo "SIGNING_KEY=\"$(openssl genpkey -algorithm ed25519)\"" >> .env
docker compose -f docker-compose.selfhost.yml up -d
```

Migrations run first as a one-off `migrate` service, then the server starts. For a real install, edit `.env` before `up -d`; see [Self-hosting](/docs/deployment/self-host/).

## 2. Create the first admin

On first boot the server prints a one-time setup code to its logs:

```bash
docker compose -f docker-compose.selfhost.yml logs server | grep "setup code"
```

Open `http://localhost:8080`. It shows the setup page: paste the code, choose your email and a password (at least 12 characters). You are now the admin, and the setup page is gone for good.

## 3. Create your first agent

The welcome wizard creates an agent and an API key, gives you the `.env` lines and a short snippet, and waits live for the agent's first decision. You can do the same later under **Agents**, or with the [CLI](/docs/reference/cli/):

```bash
intentlock agents create github-assistant --description "Triages issues"
intentlock keys create --agent github-assistant --name production
```

One agent is one application (a GitHub triage bot, a support assistant), not one per person. A new agent starts with the starter policy: block everything except calls that are in the signed plan.

Put the key in your agent app's environment, never in code:

```bash title=".env"
INTENTLOCK_URL=http://localhost:8080/api
INTENTLOCK_API_KEY=il_live_...
```

## 4. Wire it into your agent

```bash
pnpm add @intentlock/guard @intentlock/sdk zod
```

```ts title="agent.ts"
import { createGuard, defineTool, providerFromEnv, toolset } from "@intentlock/guard";
import { HybridGate } from "@intentlock/sdk";
import { z } from "zod";

const listIssues = defineTool({
  name: "github_list_issues",
  description: "List open issues in a repository",
  schema: z.object({ repo: z.string() }),
  impl: ({ repo }) => github.listIssues(repo),
});

const gate = new HybridGate({
  baseUrl: process.env.INTENTLOCK_URL!,
  apiKey: process.env.INTENTLOCK_API_KEY!,
});

const guard = createGuard({
  provider: providerFromEnv(),
  gate,
  ...toolset([listIssues]),
});

const result = await guard.run({
  user: "admin@acme.dev",
  task: "List open issues in acme/public-app",
});
console.log(result.status);
await gate.close();
```

The `user` must be an active member of your team. The [agent guard](/docs/sdk/guard/) page explains every option.

## 5. Invite your team

Accounts are invite-only. **Team → Invite** takes an email, a role and optional groups and gives you a single-use link, valid for 7 days. With SMTP configured it is also emailed. Roles:

- `admin`: manages everything.
- `approver`: approves holds.
- `member`: sees only their own runs.

Groups are free-form labels you can match in policies.

## Try it without a server

No Docker, database or model key needed. Node 22 or newer and pnpm 10.26 or newer:

```bash
git clone https://github.com/AbdullahMukadam/intentlock
cd intentlock
pnpm install
pnpm turbo run build --filter=@intentlock/evals
pnpm --filter @intentlock/sdk run example
```

```txt
ALLOW in plan, in scope           github_list_issues(acme-demo/public-app)
BLOCK not in plan (injected)      github_create_pull_request(acme-demo/public-app)
BLOCK in plan, blocked by policy  github_get_file_contents(acme-demo/private-notes)
```
