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
cp apps/server/.env.example apps/server/.env        # the only one you need for `pnpm dev`
pnpm --filter @intentlock/server prisma migrate dev
pnpm dev                                            # server :3000, inbox :3001, package watch builds
```

Each app has its own `.env.example` listing only what it reads: `apps/server` (database, signing key, sign-in, email), `apps/inbox` (the `/api` target; the defaults work in dev), `apps/demo` (demo agents: Intentlock URL, admin sign-in, model, GitHub) and `packages/evals` (model and latency bench). Copy the ones you need to `.env` next to them. A root `.env` from before still works: every app reads it after its own.

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

The npm packages (`@intentlock/core`, `sdk`, `guard`, `anthropic`, MIT, and `@intentlock/mcp-proxy`, ELv2) are versioned together (ADR-062, ADR-071); the server and inbox ship as Docker images.

**First release only:** sign in at npmjs.com, turn on two-factor authentication, then avatar → **Add Organization** → `intentlock` (free plan, matches the `@intentlock/` scope). Make the GHCR packages public once: GitHub → profile → **Packages** → `intentlock-server` / `intentlock-inbox` → **Package settings** → **Change visibility** → Public.

**Every release:**

1. On a branch, bump `version` in the five published `package.json` files to the same value, set the same version as the `INTENTLOCK_VERSION` default in `deploy/docker-compose.selfhost.yml` and `deploy/selfhost.env.example`, rename `## Unreleased` in `CHANGELOG.md` to `## X.Y.Z · YYYY-MM-DD` (and start a new empty `## Unreleased`), add a journal line, merge to `main`. The release script stops if any of these do not match.
2. On `main`, up to date and clean:
   ```bash
   npm login
   pnpm release --dry-run    # every check, the build and the npm dry run; publishes nothing
   pnpm release              # the same, then asks you to type yes, publishes and pushes vX.Y.Z
   ```
   `scripts/release.ts` stops unless the five versions match, you are on a clean `main` equal to `origin/main`, the tag is free and you are logged in to npm. It builds the packages, shows the npm dry run (each package should list only `dist/`, `README.md`, `LICENSE`, `package.json`), publishes with `pnpm -r publish` (npm asks for your 2FA code; pnpm replaces `workspace:*` and `catalog:` with real versions) and pushes the tag. If publishing stops partway, run it again: packages already on npm at that version are skipped.
3. The tag makes CI push the server and inbox images as `X.Y.Z` and `X.Y` (Actions tab). Optional release page: `gh release create vX.Y.Z --generate-notes`.

## Security issues

Do not open a public issue for a vulnerability. Email the maintainer (see the GitHub profile) with steps to reproduce.
