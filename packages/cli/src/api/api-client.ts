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
    const res = await this.ctx.fetch(this.session.url.replace(/\/+$/, "") + path, {
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

export async function readResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = (data as { error?: unknown } | null)?.error;
    throw new CliError(
      `Server answered ${res.status}${typeof error === "string" ? `: ${error}` : ""}`,
    );
  }
  return data as T;
}
