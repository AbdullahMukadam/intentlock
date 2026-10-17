import { API_ENDPOINTS, type ApiEndpoint, apiPath } from "@intentlock/core";
import type { z } from "zod";

import { ApiError } from "./api-error";
import { API_PREFIX, CSRF_HEADER, LOGIN_PATH, NEXT_PARAM } from "./constants";
import { ApiErrorCode } from "./enums/api-error-code.enum";
import { HttpMethod } from "./enums/http-method.enum";
import { HttpStatus } from "./enums/http-status.enum";
import { invalidateAll } from "./query-client";
import { ApiErrorBody } from "./schemas";

export { ApiError } from "./api-error";

type Options = {
  method?: HttpMethod;
  params?: Record<string, string | number>;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

const NO_LOGIN_REDIRECT = new Set<string>([API_ENDPOINTS.AUTH_LOGIN, API_ENDPOINTS.SETUP]);
const NO_INVALIDATE = new Set<ApiEndpoint>([
  API_ENDPOINTS.AGENT_POLICY_TEST,
  API_ENDPOINTS.INVITE_LOOKUP,
  API_ENDPOINTS.AUTH_LOGOUT,
]);

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
  return parseResponse(schema, data, res.status);
}

export function parseResponse<S extends z.ZodType>(
  schema: S,
  data: unknown,
  status: number = HttpStatus.OK,
): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(status, ApiErrorCode.UNEXPECTED_RESPONSE, data);
  return parsed.data;
}

export async function api<S extends z.ZodType>(
  endpoint: ApiEndpoint,
  schema: S,
  options: Options = {},
): Promise<z.infer<S>> {
  const result = await request(apiUrl(endpoint, options), schema, options);
  const method = options.method ?? HttpMethod.GET;
  if (method !== HttpMethod.GET && !NO_INVALIDATE.has(endpoint)) invalidateAll();
  return result;
}

export function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/";
}
