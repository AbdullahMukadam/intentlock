import { BadRequestException, NotFoundException, type ArgumentsHost } from "@nestjs/common";
import type { Logger } from "pino";
import { z } from "zod";

import { loadEnv } from "../config/env.schema.js";
import { HttpExceptionFilter } from "./http-exception.filter.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

function run(exception: unknown) {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(s: number) {
      sent.status = s;
      return this;
    },
    json(b: unknown) {
      sent.body = b;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  const log = { error: vi.fn() };
  new HttpExceptionFilter(log as unknown as Logger).catch(exception, host);
  return { ...sent, log };
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
});

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(z.object({ name: z.string().min(1) }));

  it("returns parsed data", () => {
    expect(pipe.transform({ name: "x", extra: 1 })).toEqual({ name: "x" });
  });

  it("throws 400 with field paths", () => {
    try {
      pipe.transform({ name: "" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({
        error: "validation_failed",
        issues: [{ path: "name" }],
      });
    }
  });
});

describe("loadEnv", () => {
  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("applies defaults", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://x@localhost/db", SIGNING_KEY: "" });
    expect(env).toMatchObject({ PORT: 3000, INTENTLOCK_DEMO: false, SIGNING_KEY: undefined });
  });
});
