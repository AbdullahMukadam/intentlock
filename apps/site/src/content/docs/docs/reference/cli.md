---
title: CLI
description: The intentlock command for users, agents, API keys, policies, signing keys and audit verification.
---

Install it from npm (Node 22 or newer):

```bash
npm install -g @intentlock/cli
```

`intentlock` is then on your `PATH`. For a one-off command, `npx -y @intentlock/cli <command>` works without installing, for example `npx -y @intentlock/cli audit verify --file intentlock-audit.jsonl`.

To run it from a clone instead: `pnpm install && pnpm --filter @intentlock/cli build`, then `pnpm link --global` in `packages/cli`.

## Sign in

```bash
intentlock login --url https://intentlock.acme.dev/api --email admin@acme.dev
intentlock login --url https://intentlock.acme.dev/api --email admin@acme.dev --token
```

The first form prompts for your password. People who sign in only with Google or GitHub create a CLI token under **Account settings** and use `--token`, which prompts for it. The session is stored in `~/.intentlock/session.json` (readable only by you) and used by every command below.

## Users

Admin only.

| Command | Does |
| --- | --- |
| `intentlock users invite <email> [--role <role>] [--groups <a,b>]` | Creates an invite link (7 days, single use). Role is `admin`, `approver` or `member` (default). Emailed when SMTP is set. |
| `intentlock users list` | Lists the team. |
| `intentlock users disable <email>` | Disables the user and ends their sessions. |
| `intentlock users reset-link <email>` | Creates a password reset link (24 hours, single use). |

## Agents

| Command | Does |
| --- | --- |
| `intentlock agents create <name> [--description <text>]` | Creates an agent with the starter policy. Name is kebab-case. Admin only. |
| `intentlock agents list` | Lists agents. |
| `intentlock agents disable <name>` | Stops new plans for the agent. Running plans end within their token lifetime. Admin only. |

## API keys

Admin only.

| Command | Does |
| --- | --- |
| `intentlock keys create --agent <name> --name <keyName>` | Creates a key and prints `INTENTLOCK_API_KEY=il_live_...` once. Name it after where it runs, such as `production`. |
| `intentlock keys list --agent <name>` | Lists the agent's keys with their ids. |
| `intentlock keys revoke <keyId> --agent <name>` | Revokes a key. New plans with it fail at once. |

To rotate a key: create a new one, deploy it, then revoke the old one.

## Policies

| Command | Does |
| --- | --- |
| `intentlock policy validate <file>` | Checks a policy file offline. No sign-in needed. |
| `intentlock policy pull --agent <name> [--out <file>]` | Prints the active policy, or writes it to a file. |
| `intentlock policy test --agent <name> <file> [--replay <n>] [--calls <json>]` | Dry run on the server: replays the agent's last `n` decisions, or sample calls from a JSON file (`[{ call, user, inPlan? }]`), and shows which would change. Nothing is saved. |
| `intentlock policy push --agent <name> -m <message> <file>` | Publishes the file as a new version. Admin only. |

## Signing keys

```bash
intentlock keygen
intentlock keygen --out ./keys --env
```

Creates an Ed25519 signing key (PKCS8 PEM) in `./keys/signing-key.pem`. `--env` also prints a one-line `SIGNING_KEY="..."` value for an environment file. No sign-in needed. Keep the key in a secret store and delete the local copy.

## Audit

```bash
intentlock audit verify --file audit.jsonl
```

Verifies an exported audit chain (`GET /v1/audit?format=jsonl`) offline, with the same code as the server. No sign-in needed. See [Audit chain](/docs/concepts/audit-chain/#verifying-offline).

```bash
intentlock audit verify --file audit.jsonl --archive audit-1-10000.jsonl audit-10001-20000.jsonl
```

`--archive` adds archived files of deleted entries, checked before the export, so the whole chain is verified from its first entry. An export that starts later (older entries hidden or deleted) is checked from its first entry, and the CLI says that earlier entries were not checked.
