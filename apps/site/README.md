# @intentlock/site

The public website for [Intentlock](../../README.md) (Astro + Starlight, fully static): the landing page at `/` and the user docs at `/docs`. Optional: nothing imports it and it is not part of the self-host bundle or any Docker image. Delete the folder and run `pnpm install` if you don't need it.

```bash
pnpm --filter @intentlock/site dev        # http://localhost:4321
pnpm --filter @intentlock/site build      # dist/, offline (fonts are bundled)
pnpm --filter @intentlock/site preview
pnpm --filter @intentlock/site test       # docs checks
```

- The docs are Markdown in `src/content/docs/docs/`, one file per page. They are the single source for the user guide; `docs/USAGE.md` only points here.
- `pnpm test` type-checks every TypeScript sample in the docs against the packages, checks internal links and anchors, and checks that every `API_ENDPOINTS` path is on the HTTP API page.
- Code fences take a file name: ` ```ts title="agent.ts" `.
- Build-time variables: `SITE_URL` (canonical and Open Graph links) and `INBOX_URL` (Sign in links, default `http://localhost:3001`).
- Deployed as static assets on Cloudflare Workers (`wrangler.jsonc`, `docs/DEPLOYMENT.md` §9.2).

License: Elastic-2.0.
