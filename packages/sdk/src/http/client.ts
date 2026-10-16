import { HttpMethod } from "../enums/http-method.enum.js";
import { GateUnavailableError, HttpError } from "../errors.js";
import { describeNetworkError, describeServerAnswer } from "./describe-failure.js";

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 5_000;

export class HttpClient {
  readonly #base: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(opts: HttpClientOptions) {
    this.#base = opts.baseUrl.replace(/\/+$/, "");
    this.#apiKey = opts.apiKey;
    this.#timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = opts.fetch ?? fetch;
  }

  get fetch(): typeof fetch {
    return this.#fetch;
  }

  url(path: string): string {
    return this.#base + path;
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    opts: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? this.#timeoutMs;
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (opts.signal) signals.push(opts.signal);
    let res: Response;
    try {
      res = await this.#fetch(this.url(path), {
        method,
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? null : JSON.stringify(body),
        signal: AbortSignal.any(signals),
      });
    } catch (err) {
      if (opts.signal?.aborted) throw opts.signal.reason;
      throw new GateUnavailableError(
        `${method} ${path} failed: ${describeNetworkError(err, timeoutMs)}`,
        { cause: err },
      );
    }
    let data: unknown = null;
    let unreadable: unknown;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      unreadable = err;
    }
    if (res.status >= 500)
      throw new GateUnavailableError(`${method} ${path} ${describeServerAnswer(res.status, data)}`);
    if (unreadable !== undefined)
      throw new GateUnavailableError(`${method} ${path}: unreadable response`, {
        cause: unreadable,
      });
    if (!res.ok) throw new HttpError(res.status, data);
    return data as T;
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(HttpMethod.POST, path, body);
  }
}
