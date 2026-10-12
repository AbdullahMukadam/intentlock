import { API_ENDPOINTS, apiPath } from "@intentlock/core";

import { HttpMethod } from "../enums/http-method.enum.js";
import { HoldStatus } from "../enums/hold-status.enum.js";
import type { HoldOutcome } from "../gate.js";
import type { HttpClient } from "./client.js";

const SERVER_MAX_WAIT_SECONDS = 25;
const NETWORK_GRACE_MS = 5_000;

export async function waitForHold(
  http: HttpClient,
  holdId: string,
  opts: { timeoutMs: number; signal?: AbortSignal },
): Promise<HoldOutcome> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    opts.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) return HoldStatus.EXPIRED;
    const seconds = Math.min(SERVER_MAX_WAIT_SECONDS, Math.ceil(remaining / 1000));
    const res = await http.request<{ status: HoldStatus }>(
      HttpMethod.GET,
      `${apiPath(API_ENDPOINTS.HOLD_WAIT, { id: holdId })}?timeout=${seconds}`,
      undefined,
      { ...(opts.signal && { signal: opts.signal }), timeoutMs: seconds * 1000 + NETWORK_GRACE_MS },
    );
    if (res.status !== HoldStatus.PENDING) return res.status;
  }
}
