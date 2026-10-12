import { type ArgumentsHost, NotFoundException } from "@nestjs/common";
import type { Logger } from "pino";

import { HttpExceptionFilter } from "./http-exception.filter.js";

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
