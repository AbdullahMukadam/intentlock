import { z } from "zod";

import { RunMode } from "./enums/run-mode.enum";
import { RunnerEventKind } from "./enums/runner-event-kind.enum";

const Meta = { runId: z.number(), seq: z.number(), mode: z.enum(RunMode) };

export const GuardEventView = z.object({
  type: z.string(),
  at: z.string(),
  tool: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  ruleId: z.string().nullable().optional(),
  reason: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type GuardEventView = z.infer<typeof GuardEventView>;

export const RunnerEvent = z.discriminatedUnion("kind", [
  z.object({
    ...Meta,
    kind: z.literal(RunnerEventKind.STARTED),
    task: z.string(),
    forced: z.boolean(),
  }),
  z.object({ ...Meta, kind: z.literal(RunnerEventKind.GUARD), event: GuardEventView }),
  z.object({
    ...Meta,
    kind: z.literal(RunnerEventKind.FINISHED),
    status: z.string(),
    text: z.string().nullable(),
  }),
  z.object({ ...Meta, kind: z.literal(RunnerEventKind.FAILED), reason: z.string() }),
]);
export type RunnerEvent = z.infer<typeof RunnerEvent>;

export function addEvent(events: RunnerEvent[], raw: unknown): RunnerEvent[] {
  const parsed = RunnerEvent.safeParse(raw);
  if (!parsed.success) return events;
  const e = parsed.data;
  const latest = events.at(-1)?.runId ?? 0;
  if (e.runId > latest) return [e];
  if (e.runId < latest || events.some((x) => x.seq === e.seq)) return events;
  return [...events, e];
}
