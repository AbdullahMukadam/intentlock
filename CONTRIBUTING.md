# Contributing to Intentlock

Thanks for your interest. Intentlock is a small project; issues and focused pull requests are welcome.

## Licensing of contributions

- **MIT packages** (`packages/core`, `packages/sdk`, `packages/guard`, `packages/anthropic`): contributions are accepted under the MIT License.
- **Everything else** (server, inbox, CLI, demo, evals) is under the Elastic License 2.0. Because these parts may be sold as paid editions, contributions to them will need a Contributor License Agreement (CLA) before they can be merged once the product is sold commercially. Until a CLA exists, open an issue first for non-trivial changes there.
- Never copy server or inbox code into the MIT packages.

## Setup

Node ≥ 22, pnpm ≥ 10.26, Docker.

```bash
pnpm install
docker compose up -d                                # PostgreSQL 16 (intentlock + intentlock_test) and Mailpit
cp .env.example .env
pnpm --filter @intentlock/server prisma migrate dev
pnpm dev                                            # server :3000, inbox :3001, package watch builds
```

No paid model key is needed: tests use `FakeProvider`, and live runs use whatever `LLM_PROVIDER` you set (a free OpenAI-compatible tier or local Ollama works).

## Before you open a pull request

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

- The server's e2e tests use `TEST_DATABASE_URL` and wipe it.
- Read [`docs/STRUCTURE.md`](docs/STRUCTURE.md) for where files go and the import boundaries the lint rules enforce; [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for formats and the decision algorithm.
- Conventional Commits: `feat(core): ...`, `fix(server): ...`, `docs: ...`.

## House rules

- **Fail closed.** A tool runs only on an explicit `allow`; every error path blocks. Changes that weaken this will not be merged.
- **Default deny.** Every server route needs a session unless it is explicitly public or agent-only; the route-enumeration test must stay green.
- **Pure core.** `packages/core` does no I/O; time comes from an injected `now()`.
- **Provider-agnostic guard.** Provider SDKs live only in adapters.
- Strict TypeScript, `zod` at every boundary, string enums instead of string literals for fixed sets, API paths from `API_ENDPOINTS`.
- No code comments; rationale goes in the commit message or an ADR in [`docs/DECISIONS.md`](docs/DECISIONS.md).
- Tests live in `test/unit/` (mirroring `src/`) and `test/e2e/`; every new decision path needs one, including its failure path.
- Never commit secrets. Demo data is fake.

## Releasing (maintainers)

The four MIT packages (`@intentlock/core`, `sdk`, `guard`, `anthropic`) are versioned together (ADR-062); the server and inbox ship as Docker images.

1. Bump `version` in the four `package.json` files to the same value and add a line to the journal.
2. Check the packages build and contain only `dist/`, `README.md` and `LICENSE`:
   ```bash
   pnpm turbo run build --filter=@intentlock/core --filter=@intentlock/sdk --filter=@intentlock/guard --filter=@intentlock/anthropic
   pnpm -r --filter "./packages/{core,sdk,guard,anthropic}" publish --dry-run --no-git-checks
   ```
3. Publish from a clean `main` (pnpm replaces `workspace:*` and `catalog:` with real versions; `publishConfig.access` is `public`):
   ```bash
   npm login
   pnpm -r --filter "./packages/{core,sdk,guard,anthropic}" publish
   ```
4. Tag the release and push the tag; CI pushes the server and inbox images as `X.Y.Z` and `X.Y`:
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```

## Security issues

Do not open a public issue for a vulnerability. Email the maintainer (see the GitHub profile) with steps to reproduce.
