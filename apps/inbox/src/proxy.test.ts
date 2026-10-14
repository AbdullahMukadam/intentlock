import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import nextConfig from "../next.config";
import { config, proxy } from "./proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3001${path}`, cookie ? { headers: { cookie } } : undefined);

describe("proxy", () => {
  test("no session cookie redirects to /login and keeps the target", () => {
    const res = proxy(request("/holds?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3001/login?next=%2Fholds%3Fx%3D1");
  });

  test("the overview redirects to a bare /login", () => {
    expect(proxy(request("/")).headers.get("location")).toBe("http://localhost:3001/login");
  });

  test("a session cookie passes through", () => {
    const res = proxy(request("/agents", "il_session=abc"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  test.each(["/", "/holds", "/agents/a1", "/runs/p1", "/audit", "/demo"])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(true);
  });

  test.each(["/login", "/api/v1/me", "/_next/static/x.js", "/favicon.ico"])("skips %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(false);
  });
});
