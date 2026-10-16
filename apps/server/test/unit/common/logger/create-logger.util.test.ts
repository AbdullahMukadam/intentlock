import type { Request, Response } from "express";

import { createLogger } from "../../../../src/common/logger/create-logger.util.js";
import { requestIdMiddleware } from "../../../../src/common/middleware/request-id.middleware.js";

describe("createLogger", () => {
  it("adds the request id to lines logged during a request, and only then", () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger("info", {
      write: (line: string) => lines.push(JSON.parse(line) as Record<string, unknown>),
    });
    const req = { get: () => "req-7" } as unknown as Request;
    const res = { setHeader: () => undefined } as unknown as Response;
    requestIdMiddleware(req, res, () => log.info("inside"));
    log.info("outside");
    expect(lines.map((l) => [l["msg"], l["requestId"]])).toEqual([
      ["inside", "req-7"],
      ["outside", undefined],
    ]);
  });
});
