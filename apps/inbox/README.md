# @intentlock/inbox

The [Intentlock](../../README.md) web app (Next.js): sign-in, overview dashboard, activity and run detail, live holds with approve/reject, agents with API keys, the policy editor (live validation, dry-run tests, diff, publish, rollback), audit chain verification, and the `/demo` split screen.

Every page requires sign-in. Role checks in the UI only hide actions; the server enforces them.

```bash
pnpm --filter @intentlock/server dev     # API on :3000
pnpm --filter @intentlock/inbox dev      # http://localhost:3001
```

The browser only talks to the inbox's origin: `/api/*` is rewritten to the server at `API_URL` (read at build time), so session cookies stay same-origin.

Optional at build time: `NEXT_PUBLIC_DOCS_URL` adds a "Docs" link to the sidebar (for example `https://<site>/docs/`); unset, the link is hidden. Favicons live in `public/` and `src/app/favicon.ico`; the sign-in proxy lets only those files through without a session.

License: Elastic-2.0.
