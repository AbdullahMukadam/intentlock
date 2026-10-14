# @intentlock/cli

The `intentlock` command for [Intentlock](../../README.md).

```bash
pnpm install && pnpm --filter @intentlock/cli build
cd packages/cli && pnpm link --global
```

| Command                                               | Needs a server |
| ----------------------------------------------------- | -------------- |
| `intentlock keygen [--out dir] [--env]`               | no             |
| `intentlock policy validate <file>`                   | no             |
| `intentlock audit verify --file export.jsonl`         | no             |
| `intentlock login --url <server> --email <you>`       | yes            |
| `intentlock users add\|list\|disable\|token`          | yes (admin)    |
| `intentlock agents create\|list\|disable`             | yes            |
| `intentlock keys create\|list\|revoke --agent <name>` | yes (admin)    |
| `intentlock policy pull\|test\|push --agent <name>`   | yes            |

`login` asks for your personal login token (or takes `--token`) and stores the session for later commands. Run `intentlock <command> --help` for flags. Walkthrough: [`docs/USAGE.md`](../../docs/USAGE.md) §3 and §5.

License: Elastic-2.0.
