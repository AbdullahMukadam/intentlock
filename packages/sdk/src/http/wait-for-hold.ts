import { setTimeout as sleep } from "node:timers/promises";

import { API_ENDPOINTS, apiPath, HoldStatus } from "@intentlock/core";

import { HttpMethod } from "../enums/http-method.enum.js";
import { GateUnavailableError } from "../errors.js";
import type { HoldOutcome } from "../gate.js";
import { backoffMs } from "../outbox/worker.js";
import type { HttpClient } from "./client.js";

const SERVER_MAX_WAIT_SECONDS = 25;
const NETWORK_GRACE_MS = 5_000;
const RETRY_CAP_MS = 5_000;

export async function waitForHold(
  http: HttpClient,
  holdId: string,
  opts: { timeoutMs: number; signal?: AbortSignal; onRetry?: (err: unknown) => void },
): Promise<HoldOutcome> {
  const deadline = Date.now() + opts.timeoutMs;
  let failures = 0;
  let lastError: GateUnavailableError | null = null;
  for (;;) {
    opts.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      if (lastError !== null) throw lastError;
      return HoldStatus.EXPIRED;
    }
    const seconds = Math.min(SERVER_MAX_WAIT_SECONDS, Math.ceil(remaining / 1000));
    let res: { status: HoldStatus };
    try {
      res = await http.request<{ status: HoldStatus }>(
        HttpMethod.GET,
        `${apiPath(API_ENDPOINTS.HOLD_WAIT, { id: holdId })}?timeout=${seconds}`,
        undefined,
        {
          ...(opts.signal && { signal: opts.signal }),
          timeoutMs: seconds * 1000 + NETWORK_GRACE_MS,
        },
      );
    } catch (err) {
      if (!(err instanceof GateUnavailableError) || opts.signal?.aborted) throw err;
      failures++;
      lastError = err;
      opts.onRetry?.(err);
      const delay = Math.max(0, Math.min(backoffMs(failures), RETRY_CAP_MS, deadline - Date.now()));
      await sleep(delay, undefined, opts.signal ? { signal: opts.signal } : {});
      continue;
    }
    failures = 0;
    lastError = null;
    if (res.status !== HoldStatus.PENDING) return res.status;
  }
}
