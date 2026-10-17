import { CSRF_HEADER } from "../constants/cli.constants.js";
import { HttpMethod } from "../enums/http-method.enum.js";
import { CliError } from "../errors.js";
import type { Session } from "../session/session-store.js";
import type { CliContext } from "../types/cli-context.type.js";

export class ApiClient {
  constructor(
    private readonly ctx: CliContext,
    private readonly session: Session,
  ) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>(HttpMethod.GET, path);
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>(HttpMethod.POST, path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(HttpMethod.PATCH, path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(HttpMethod.DELETE, path);
  }

  async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const res = await send(this.ctx, this.session.url.replace(/\/+$/, "") + path, {
      method,
      headers: {
        cookie: this.session.cookie,
        [CSRF_HEADER]: "1",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
    return readResponse<T>(res);
  }
}

export async function send(ctx: CliContext, url: string, init: RequestInit): Promise<Response> {
  try {
    return await ctx.fetch(url, init);
  } catch (err) {
    const code = (err as { cause?: { code?: unknown } }).cause?.code;
    const reason =
      typeof code === "string" ? code : err instanceof Error ? err.message : String(err);
    throw new CliError(`Cannot reach ${new URL(url).origin}: ${reason}`, { cause: err });
  }
}

export async function readResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  let json = true;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    json = false;
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: unknown; requestId?: unknown };
    const code = typeof body.error === "string" ? `: ${body.error}` : "";
    const request = typeof body.requestId === "string" ? ` (request ${body.requestId})` : "";
    throw new CliError(`Server answered ${res.status}${code}${request}`);
  }
  if (!json) {
    throw new CliError(
      "Server answered with something that is not JSON; --url should be the API, e.g. https://intentlock.acme.dev/api",
    );
  }
  return data as T;
}
