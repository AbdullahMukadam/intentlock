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
| `intentlock users invite\|list\|disable\|reset-link`  | yes (admin)    |
| `intentlock agents create\|list\|disable`             | yes            |
| `intentlock keys create\|list\|revoke --agent <name>` | yes (admin)    |
| `intentlock policy pull\|test\|push --agent <name>`   | yes            |

`login` asks for your password (or, with `--token`, a CLI token from account settings, for people who sign in only with Google/GitHub) and stores the session for later commands. Run `intentlock <command> --help` for flags. Every command: [CLI reference](../../apps/site/src/content/docs/docs/reference/cli.md).

License: Elastic-2.0.
