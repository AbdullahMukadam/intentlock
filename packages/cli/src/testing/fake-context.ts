import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CliContext } from "../types/cli-context.type.js";

export type Recorded = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
};
type Handler = (body: unknown) => Response;

export async function fakeContext(routes: Record<string, Handler> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "intentlock-cli-"));
  const lines: string[] = [];
  const requests: Recorded[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({
      method,
      path: url.pathname,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body,
    });
    const handler = routes[`${method} ${url.pathname}`];
    return handler ? handler(body) : Response.json({ error: "not_found" }, { status: 404 });
  }) as typeof globalThis.fetch;
  const ctx: CliContext = {
    fetch,
    home: dir,
    cwd: dir,
    print: (line) => lines.push(line),
    prompt: async () => "prompted-token",
  };
  return { ctx, dir, lines, requests };
}
