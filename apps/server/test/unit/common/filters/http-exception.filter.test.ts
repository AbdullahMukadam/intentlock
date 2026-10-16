import { type ArgumentsHost, NotFoundException } from "@nestjs/common";
import type { Logger } from "pino";

import type { Request, Response } from "express";

import { HttpExceptionFilter } from "../../../../src/common/filters/http-exception.filter.js";
import { requestIdMiddleware } from "../../../../src/common/middleware/request-id.middleware.js";
import { Prisma } from "../../../../src/generated/prisma/client.js";

function run(exception: unknown) {
  const sent: { status?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const res = {
    set(name: string, value: string) {
      sent.headers[name] = value;
      return this;
    },
    status(s: number) {
      sent.status = s;
      return this;
    },
    json(b: unknown) {
      sent.body = b;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  const log = { error: vi.fn(), warn: vi.fn() };
  new HttpExceptionFilter(log as unknown as Logger).catch(exception, host);
  return { ...sent, log };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Can't reach database server at db:5432", {
    code,
    clientVersion: "7",
  });
}

describe("HttpExceptionFilter", () => {
  it("returns a bare 500 for unknown errors and never leaks the message or stack", () => {
    const { status, body, log } = run(new Error("db password is hunter2"));
    expect(status).toBe(500);
    expect(body).toEqual({ statusCode: 500, error: "internal_error" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("passes HTTP errors through", () => {
    const { status, body } = run(new NotFoundException());
    expect(status).toBe(404);
    expect(body).toMatchObject({ statusCode: 404 });
  });

  it("answers 503 with Retry-After for a transient database failure and logs a warning", () => {
    const { status, body, headers, log } = run(prismaError("P1001"));
    expect(status).toBe(503);
    expect(body).toEqual({ statusCode: 503, error: "database_unavailable" });
    expect(headers["Retry-After"]).toBe("2");
    expect(JSON.stringify(body)).not.toContain("db:5432");
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("puts the request id in 500 and 503 bodies", () => {
    const req = { get: () => "req-42" } as unknown as Request;
    const res = { setHeader: () => undefined } as unknown as Response;
    let bodies: unknown[] = [];
    requestIdMiddleware(req, res, () => {
      bodies = [run(new Error("boom")).body, run(prismaError("P2028")).body];
    });
    expect(bodies).toEqual([
      { statusCode: 500, error: "internal_error", requestId: "req-42" },
      { statusCode: 503, error: "database_unavailable", requestId: "req-42" },
    ]);
  });

  it("answers 409 for a unique violation no service mapped", () => {
    const { status, body, log } = run(prismaError("P2002"));
    expect(status).toBe(409);
    expect(body).toEqual({ statusCode: 409, error: "conflict" });
    expect(log.error).not.toHaveBeenCalled();
  });
});
