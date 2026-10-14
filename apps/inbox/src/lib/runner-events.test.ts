import { expect, test } from "vitest";

import { addEvent, type RunnerEvent } from "./runner-events";

const guard = (runId: number, seq: number) => ({
  runId,
  seq,
  mode: "protected",
  kind: "guard",
  event: { type: "block", at: "2026-10-13T12:00:00Z", tool: "github_list_repos", ruleId: null },
});

test("a replayed event after a reconnect is not added twice", () => {
  let events: RunnerEvent[] = [];
  events = addEvent(events, guard(1, 1));
  events = addEvent(events, guard(1, 2));
  events = addEvent(events, guard(1, 1));
  expect(events.map((e) => e.seq)).toEqual([1, 2]);
});

test("a new run replaces the previous one; stale events are ignored", () => {
  let events = addEvent([], guard(1, 1));
  events = addEvent(events, guard(2, 1));
  events = addEvent(events, guard(1, 2));
  expect(events.map((e) => [e.runId, e.seq])).toEqual([[2, 1]]);
});

test("malformed frames are dropped", () => {
  expect(addEvent([], { kind: "guard" })).toEqual([]);
});
