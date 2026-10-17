import type { NextFunction, Request, Response } from "express";

import {
  formatServerTiming,
  recordDbQuery,
  serverTimingMiddleware,
} from "../../../../src/common/middleware/server-timing.middleware.js";

describe("formatServerTiming", () => {
  it("reports total and database time in milliseconds with the query count", () => {
    const timing = { startedAt: 0n, dbMs: 4.56, dbQueries: 3 };
    expect(formatServerTiming(timing, 12_340_000n)).toBe(
      'total;dur=12.3, db;dur=4.6;desc="3 queries"',
    );
  });
});

describe("serverTimingMiddleware", () => {
  it("adds up the queries of the request and sets the header when headers are written", () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      writeHead: () => undefined,
    } as unknown as Response;
    const next: NextFunction = () => {
      recordDbQuery(2);
      recordDbQuery(3.5);
    };
    serverTimingMiddleware({} as Request, res, next);
    res.writeHead(200);
    expect(headers["Server-Timing"]).toMatch(/^total;dur=\d+\.\d, db;dur=5\.5;desc="2 queries"$/);
  });

  it("ignores queries made outside a request", () => {
    expect(() => recordDbQuery(1)).not.toThrow();
  });
});
