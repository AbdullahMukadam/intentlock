import { API_ENDPOINTS, type ApiEndpoint, apiPath } from "@intentlock/core";
import type { z } from "zod";

import { API_PREFIX, CSRF_HEADER, LOGIN_PATH, NEXT_PARAM } from "./constants";
import { HttpMethod } from "./enums/http-method.enum";
import { HttpStatus } from "./enums/http-status.enum";
import { ApiErrorBody } from "./schemas";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body?: unknown,
  ) {
    super(`${status} ${code}`);
  }
}

type Options = {
  method?: HttpMethod;
  params?: Record<string, string | number>;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

const NO_LOGIN_REDIRECT = new Set<string>([API_ENDPOINTS.AUTH_LOGIN, API_ENDPOINTS.SETUP]);

export function apiUrl(endpoint: ApiEndpoint, { params, query }: Options = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return `${API_PREFIX}${apiPath(endpoint, params)}${qs ? `?${qs}` : ""}`;
}

export function loginRedirect() {
  const next = window.location.pathname + window.location.search;
  const target =
    next === "/" ? LOGIN_PATH : `${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}`;
  window.location.assign(target);
}

export async function request<S extends z.ZodType>(
  url: string,
  schema: S,
  { method = HttpMethod.GET, body }: Pick<Options, "method" | "body"> = {},
): Promise<z.infer<S>> {
  const headers: Record<string, string> = {};
  if (method !== HttpMethod.GET) headers[CSRF_HEADER] = "1";
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (
    res.status === HttpStatus.UNAUTHORIZED &&
    !NO_LOGIN_REDIRECT.has(url.slice(API_PREFIX.length).split("?")[0] ?? "")
  ) {
    loginRedirect();
  }
  const data: unknown =
    res.status === HttpStatus.NO_CONTENT ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = ApiErrorBody.safeParse(data);
    throw new ApiError(res.status, parsed.success ? parsed.data.error : res.statusText, data);
  }
  return schema.parse(data);
}

export function api<S extends z.ZodType>(
  endpoint: ApiEndpoint,
  schema: S,
  options: Options = {},
): Promise<z.infer<S>> {
  return request(apiUrl(endpoint, options), schema, options);
}

export function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/";
}
