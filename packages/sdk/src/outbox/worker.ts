import { API_ENDPOINTS, type ClientEntry } from "@intentlock/core";

import type { HttpClient } from "../http/client.js";
import type { MemoryOutbox } from "./memory-outbox.js";

export interface WorkerOptions {
  flushIntervalMs: number;
  maxBatch: number;
  onError?: (err: unknown) => void;
}

const BACKOFF_START_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;
const DRAIN_RETRY_MS = 200;

type BatchResponse = { ackedThrough: number };

export function backoffMs(failures: number, random = Math.random): number {
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.5 + random() / 2));
}

export class OutboxWorker {
  readonly #outbox: MemoryOutbox;
  readonly #http: HttpClient;
  readonly #opts: WorkerOptions;
  #timer: NodeJS.Timeout | undefined;
  #running: Promise<boolean> | null = null;
  #failures = 0;
  #retryAt = 0;

  constructor(outbox: MemoryOutbox, http: HttpClient, opts: WorkerOptions) {
    this.#outbox = outbox;
    this.#http = http;
    this.#opts = opts;
  }

  start() {
    this.#timer ??= setInterval(() => this.#flushInBackground(), this.#opts.flushIntervalMs);
    this.#timer.unref();
  }

  stop() {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  nudge() {
    if (this.#outbox.unackedCount() >= this.#opts.maxBatch) this.#flushInBackground();
  }

  #flushInBackground() {
    this.flush().catch((err: unknown) => this.#opts.onError?.(err));
  }

  flush(force = false): Promise<boolean> {
    if (this.#running) return this.#running;
    if (!force && Date.now() < this.#retryAt) return Promise.resolve(false);
    this.#running = this.#upload().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async drain(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.#outbox.unackedCount() === 0) return true;
      if (await this.flush(true)) return true;
      await new Promise((r) => setTimeout(r, DRAIN_RETRY_MS));
    }
    return this.#outbox.unackedCount() === 0;
  }

  async #upload(): Promise<boolean> {
    try {
      for (const { planId, entries } of this.#outbox.pending(this.#opts.maxBatch)) {
        const res = await this.#http.post<BatchResponse>(
          API_ENDPOINTS.AUDIT_BATCH,
          toWire(planId, entries),
        );
        await this.#outbox.ack(planId, res.ackedThrough);
      }
      this.#failures = 0;
      this.#retryAt = 0;
      return this.#outbox.unackedCount() === 0;
    } catch (err) {
      this.#failures++;
      this.#retryAt = Date.now() + backoffMs(this.#failures);
      this.#opts.onError?.(err);
      return false;
    }
  }
}

export function toWire(planId: string, entries: ClientEntry[]) {
  const tokens: string[] = [];
  const refs = new Map<string, number>();
  const wire = entries.map(({ token, ...rest }) => {
    let ref = refs.get(token);
    if (ref === undefined) {
      ref = tokens.push(token) - 1;
      refs.set(token, ref);
    }
    return { ...rest, tokenRef: ref };
  });
  return { planId, tokens, entries: wire };
}
