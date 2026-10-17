import { AsyncLocalStorage } from "node:async_hooks";

import type { NextFunction, Request, Response } from "express";

import { SERVER_TIMING_HEADER } from "../constants/http.constants.js";
import { ServerTimingMetric } from "../enums/server-timing-metric.enum.js";

type RequestTiming = { startedAt: bigint; dbMs: number; dbQueries: number };

const NS_PER_MS = 1_000_000;
const storage = new AsyncLocalStorage<RequestTiming>();

export function recordDbQuery(durationMs: number) {
  const timing = storage.getStore();
  if (!timing) return;
  timing.dbMs += durationMs;
  timing.dbQueries += 1;
}

export function formatServerTiming(timing: RequestTiming, now: bigint): string {
  const totalMs = Number(now - timing.startedAt) / NS_PER_MS;
  return [
    `${ServerTimingMetric.TOTAL};dur=${totalMs.toFixed(1)}`,
    `${ServerTimingMetric.DB};dur=${timing.dbMs.toFixed(1)};desc="${timing.dbQueries} queries"`,
  ].join(", ");
}

export function serverTimingMiddleware(_req: Request, res: Response, next: NextFunction) {
  const timing: RequestTiming = { startedAt: process.hrtime.bigint(), dbMs: 0, dbQueries: 0 };
  const writeHead = res.writeHead;
  res.writeHead = ((...args: Parameters<Response["writeHead"]>) => {
    res.setHeader(SERVER_TIMING_HEADER, formatServerTiming(timing, process.hrtime.bigint()));
    return writeHead.apply(res, args);
  }) as Response["writeHead"];
  storage.run(timing, next);
}
