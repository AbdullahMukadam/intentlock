import type { EventType } from "./enums/event-type.enum.js";

export interface GuardEvent {
  type: EventType;
  at: string;
  user: string;
  provider: string;
  planId?: string;
  tool?: string;
  args?: Record<string, unknown>;
  ruleId?: string | null;
  reason?: string;
  holdId?: string;
  latencyMs?: number;
}

export type EventSink = (e: Omit<GuardEvent, "at" | "user" | "provider">) => void;

export function eventSink(
  onEvent: ((e: GuardEvent) => void) | undefined,
  base: { user: string; provider: string; now: () => Date },
): EventSink {
  return (e) => {
    if (!onEvent) return;
    try {
      onEvent({ at: base.now().toISOString(), user: base.user, provider: base.provider, ...e });
    } catch {
      return;
    }
  };
}
