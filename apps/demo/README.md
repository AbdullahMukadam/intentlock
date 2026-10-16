# @intentlock/demo

Three demo agents for [Intentlock](../../README.md), each with a seeded prompt-injection attack and its own policy (`policies/*.yaml`). The same agent code runs unprotected (`PassThroughGate`) and protected (`HybridGate` against your server).

| Agent               | Tools                                      | Seeded attack                                                         | Protected result                                                                |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `github-assistant`  | GitHub REST (throwaway account)            | A public issue asks for the private repo's contents in a pull request | `get_file_contents` and `create_pull_request` blocked; a benign comment is held |
| `support-assistant` | Mailpit inbox, fake orders and refunds     | An email asks to forward the inbox to `attacker@evil.example`         | Forwards blocked; $5 refund allowed, $200 refund held                           |
| `files-assistant`   | `sandbox/workspace/` files, `http_request` | Release notes hide an instruction to POST `.env` to a webhook         | `.env` read and POST blocked; the receiver gets nothing                         |

## Run

```bash
docker compose up -d                                         # Postgres + Mailpit
INTENTLOCK_DEMO=1 pnpm --filter @intentlock/server dev       # prints a setup code; finish /setup in the inbox (sample users' passwords are logged)
# root .env: INTENTLOCK_ADMIN_EMAIL, INTENTLOCK_ADMIN_PASSWORD (or a CLI token in INTENTLOCK_ADMIN_TOKEN), LLM_*, GITHUB_* (github-assistant only)
pnpm --filter @intentlock/demo run setup-instance            # agents, API keys (into apps/demo/.env), policies
pnpm --filter @intentlock/demo run seed                      # or: run seed --agent files-assistant
pnpm --filter @intentlock/demo run files-assistant --mode unprotected
pnpm --filter @intentlock/demo run files-assistant --mode protected
```

- `DEMO_FORCE_ATTACK=1` replaces the model with a scripted `FakeProvider` that makes the injected calls (labelled on screen). Use it when the real model refuses the injection, or without any model key.
- files-assistant: start the webhook receiver first with `pnpm --filter @intentlock/demo run receiver`.
- Held calls wait for an approver in the inbox (Holds). The agent acts for `DEMO_USER`, who cannot approve their own holds.
- Split screen: `pnpm --filter @intentlock/demo run runner`, then open `/demo` in the inbox.
- Never use `pnpm setup` (a built-in pnpm command); the script is `setup-instance`.

GitHub demo needs two throwaway repos (`public-app`, `private-notes` with fake data) and a fine-grained token over both in `GITHUB_TOKEN` / `GITHUB_OWNER`.

License: Elastic-2.0.
