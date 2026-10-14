import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { GuardEvent } from "@intentlock/guard";

import { RunMode } from "./enums/run-mode.enum.js";
import { RunnerEventKind } from "./enums/runner-event-kind.enum.js";

export const RUNNER_HEADER = "x-intentlock-demo";
export const RUNNER_PATHS = { EVENTS: "/events", RUNS: "/runs" } as const;

const HTTP = { OK: 200, ACCEPTED: 202, BAD_REQUEST: 400, NOT_FOUND: 404, CONFLICT: 409 } as const;

type Payload =
  | { kind: RunnerEventKind.STARTED; task: string; forced: boolean }
  | { kind: RunnerEventKind.GUARD; event: GuardEvent }
  | { kind: RunnerEventKind.FINISHED; status: string; text: string | null }
  | { kind: RunnerEventKind.FAILED; reason: string };

export type RunnerEvent = Payload & { runId: number; seq: number; mode: RunMode };

export type StartRun = (mode: RunMode, emit: (e: Payload) => void) => Promise<void>;

const MODES = [RunMode.UNPROTECTED, RunMode.PROTECTED];

export function createRunner(start: StartRun): Server {
  let runId = 0;
  let seq = 0;
  let running = false;
  let history: RunnerEvent[] = [];
  const clients = new Set<ServerResponse>();

  function publish(mode: RunMode, payload: Payload) {
    const event: RunnerEvent = { ...payload, runId, seq: ++seq, mode };
    history.push(event);
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) client.write(frame);
  }

  async function runBoth() {
    running = true;
    runId += 1;
    history = [];
    await Promise.all(
      MODES.map((mode) =>
        start(mode, (e) => publish(mode, e)).catch((err: unknown) =>
          publish(mode, {
            kind: RunnerEventKind.FAILED,
            reason: err instanceof Error ? err.message : String(err),
          }),
        ),
      ),
    );
    running = false;
  }

  function stream(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(HTTP.OK, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(`retry: 2000\n\n`);
    for (const e of history) res.write(`data: ${JSON.stringify(e)}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
  }

  return createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://runner").pathname;
    if (req.method === "GET" && path === RUNNER_PATHS.EVENTS) return stream(req, res);
    if (req.method === "POST" && path === RUNNER_PATHS.RUNS) {
      if (req.headers[RUNNER_HEADER] !== "1") return res.writeHead(HTTP.BAD_REQUEST).end();
      if (running) return res.writeHead(HTTP.CONFLICT).end();
      void runBoth();
      return res
        .writeHead(HTTP.ACCEPTED, { "content-type": "application/json" })
        .end(JSON.stringify({ runId }));
    }
    res.writeHead(HTTP.NOT_FOUND).end();
  });
}
