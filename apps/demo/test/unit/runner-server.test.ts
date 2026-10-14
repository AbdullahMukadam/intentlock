import type { AddressInfo } from "node:net";

import { EventType } from "@intentlock/guard";
import { afterEach, expect, test } from "vitest";

import { RunMode } from "../../src/enums/run-mode.enum.js";
import { RunnerEventKind } from "../../src/enums/runner-event-kind.enum.js";
import {
  createRunner,
  RUNNER_HEADER,
  RUNNER_PATHS,
  type RunnerEvent,
} from "../../src/runner-server.js";

const servers: ReturnType<typeof createRunner>[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    s.close();
  }
});

async function listen(runner: ReturnType<typeof createRunner>) {
  servers.push(runner);
  await new Promise<void>((resolve) => runner.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(runner.address() as AddressInfo).port}`;
}

async function readEvents(url: string, count: number): Promise<RunnerEvent[]> {
  const res = await fetch(url + RUNNER_PATHS.EVENTS);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const events: RunnerEvent[] = [];
  let buffer = "";
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const f of frames) if (f.startsWith("data: ")) events.push(JSON.parse(f.slice(6)));
  }
  await reader.cancel();
  return events;
}

const start = (mode: RunMode, emit: Parameters<Parameters<typeof createRunner>[0]>[1]) => {
  emit({ kind: RunnerEventKind.STARTED, task: "t", forced: true });
  if (mode === RunMode.PROTECTED) return Promise.reject(new Error("server down"));
  emit({
    kind: RunnerEventKind.GUARD,
    event: { type: EventType.ALLOW, at: "x", user: "u", provider: "fake", tool: "a" },
  });
  emit({ kind: RunnerEventKind.FINISHED, status: "completed", text: "done" });
  return Promise.resolve();
};

test("a run streams both modes; a failing mode reports instead of crashing", async () => {
  const url = await listen(createRunner(start));
  const res = await fetch(url + RUNNER_PATHS.RUNS, {
    method: "POST",
    headers: { [RUNNER_HEADER]: "1" },
  });
  expect(res.status).toBe(202);
  const events = await readEvents(url, 5);
  const by = (mode: RunMode) => events.filter((e) => e.mode === mode).map((e) => e.kind);
  expect(by(RunMode.UNPROTECTED)).toEqual([
    RunnerEventKind.STARTED,
    RunnerEventKind.GUARD,
    RunnerEventKind.FINISHED,
  ]);
  expect(by(RunMode.PROTECTED)).toEqual([RunnerEventKind.STARTED, RunnerEventKind.FAILED]);
  expect(new Set(events.map((e) => e.runId))).toEqual(new Set([1]));
});

test("starting a run needs the demo header, so other sites cannot trigger one", async () => {
  const url = await listen(createRunner(start));
  expect((await fetch(url + RUNNER_PATHS.RUNS, { method: "POST" })).status).toBe(400);
});

test("a second start while running is refused", async () => {
  let release = () => {};
  const url = await listen(createRunner(() => new Promise<void>((resolve) => (release = resolve))));
  const post = () =>
    fetch(url + RUNNER_PATHS.RUNS, { method: "POST", headers: { [RUNNER_HEADER]: "1" } });
  expect((await post()).status).toBe(202);
  expect((await post()).status).toBe(409);
  release();
});
