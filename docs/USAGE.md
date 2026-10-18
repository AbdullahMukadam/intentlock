# Usage

The user guide moved to the public website (ADR-066). Its source lives in [`apps/site/src/content/docs/docs/`](../apps/site/src/content/docs/docs/), one Markdown file per page:

| Topic | File |
| --- | --- |
| Quick start (self-host bundle, first admin, first agent) | [`quick-start.md`](../apps/site/src/content/docs/docs/quick-start.md) |
| Plans, policies, verdicts, holds, audit chain, gates | [`concepts/`](../apps/site/src/content/docs/docs/concepts/) |
| Packages, guard, providers, gates, core, testing | [`sdk/`](../apps/site/src/content/docs/docs/sdk/) |
| Policy format, CLI, HTTP API | [`reference/`](../apps/site/src/content/docs/docs/reference/) |
| Self-hosting, free hosting, environment variables | [`deployment/`](../apps/site/src/content/docs/docs/deployment/) |
| Security model and operating checklist | [`security.md`](../apps/site/src/content/docs/docs/security.md) |
| Licensing | [`licensing.md`](../apps/site/src/content/docs/docs/licensing.md) |

Edit those files, not this one. The TypeScript samples in them are type-checked against the packages and their internal links are checked by `pnpm --filter @intentlock/site test`.
