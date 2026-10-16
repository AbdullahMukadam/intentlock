import type { NextFunction, Request, Response } from "express";

import {
  currentRequestId,
  requestIdMiddleware,
} from "../../../../src/common/middleware/request-id.middleware.js";

function run(incoming?: string) {
  const headers: Record<string, string> = {};
  const req = { get: () => incoming } as unknown as Request;
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;
  let seen: string | undefined;
  const next: NextFunction = () => {
    seen = currentRequestId();
  };
  requestIdMiddleware(req, res, next);
  return { header: headers["X-Request-Id"], seen };
}

describe("requestIdMiddleware", () => {
  it("generates an id, sets the header and exposes it for the rest of the request", () => {
    const { header, seen } = run();
    expect(header).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen).toBe(header);
    expect(currentRequestId()).toBeUndefined();
  });

  it("keeps a safe incoming id, such as one from nginx", () => {
    expect(run("a1b2c3-proxy.7").header).toBe("a1b2c3-proxy.7");
  });

  it("replaces an incoming id that could inject into logs", () => {
    const { header } = run('x\n{"level":60}');
    expect(header).toMatch(/^[0-9a-f-]{36}$/);
    expect(run("x".repeat(65)).header).toMatch(/^[0-9a-f-]{36}$/);
  });
});
