import { API_ENDPOINTS, type ApiEndpoint, apiPath } from "@intentlock/core";

const CSRF_HEADER = "x-intentlock-csrf";

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Intentlock answered ${status}: ${JSON.stringify(body)}`);
  }
}

export type AdminCredentials = { password: string } | { token: string };

export async function adminSession(baseUrl: string, email: string, credentials: AdminCredentials) {
  let cookie = "";

  async function call<T>(
    method: string,
    endpoint: ApiEndpoint,
    params: Record<string, string | number> = {},
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(new URL(apiPath(endpoint, params), baseUrl), {
      method,
      headers: {
        cookie,
        [CSRF_HEADER]: "1",
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0] ?? "";
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new AdminApiError(res.status, data);
    return data as T;
  }

  await call("POST", API_ENDPOINTS.AUTH_LOGIN, {}, { email, ...credentials });
  return call;
}

export type AdminCall = Awaited<ReturnType<typeof adminSession>>;

export async function acceptInvite(baseUrl: string, token: string, password: string) {
  const res = await fetch(new URL(apiPath(API_ENDPOINTS.INVITE_ACCEPT), baseUrl), {
    method: "POST",
    headers: { [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) throw new AdminApiError(res.status, await res.json().catch(() => null));
}
