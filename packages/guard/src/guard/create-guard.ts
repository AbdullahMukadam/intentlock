import { IntentlockError, PlanStep, type PlanInput } from "@intentlock/core";
import { z } from "zod";

import type { ToolCallReq, ToolResult } from "../provider/types.js";
import { EventType } from "./enums/event-type.enum.js";
import { PlanSource } from "./enums/plan-source.enum.js";
import { eventSink } from "./events.js";
import { executeCalls, type GuardSession } from "./execute.js";
import { runLoop, type RunResult } from "./loop.js";
import { GuardOptions, type GuardOptionsInput } from "./options.js";
import { planWithModel } from "./planner.js";

const RunInput = z.object({
  user: z.email(),
  task: z.string().min(1),
  goal: z.string().max(500).optional(),
  steps: z.array(z.input(PlanStep)).min(1).optional(),
});
export type RunInput = z.input<typeof RunInput>;

export interface Guard {
  start(input: RunInput): Promise<GuardSession>;
  execute(session: GuardSession, calls: ToolCallReq[]): Promise<ToolResult[]>;
  run(input: RunInput): Promise<RunResult>;
}

export function createGuard(options: GuardOptionsInput): Guard {
  const parsed = GuardOptions.safeParse(options);
  if (!parsed.success) {
    throw new IntentlockError(`Invalid guard options: ${z.prettifyError(parsed.error)}`);
  }
  const opts = parsed.data;
  const now = opts.now ?? (() => new Date());

  const context = (user: string) => ({
    gate: opts.gate,
    impls: opts.impls,
    holdTimeoutMs: opts.holdTimeoutMs,
    emit: eventSink(opts.onEvent, { user, provider: opts.provider.name, now }),
    now,
  });

  async function start(raw: RunInput): Promise<GuardSession> {
    const input = RunInput.parse(raw);
    const emit = context(input.user).emit;
    let plan: PlanInput;
    try {
      if (opts.planSource === PlanSource.EXPLICIT) {
        if (!input.steps) throw new IntentlockError("planSource explicit needs steps");
        plan = {
          version: 1,
          user: input.user,
          goal: input.goal ?? input.task.slice(0, 500),
          steps: input.steps,
        };
      } else {
        plan = await planWithModel(opts.provider, {
          user: input.user,
          task: input.task,
          tools: opts.tools,
          ...(opts.maxTokens !== undefined && { maxTokens: opts.maxTokens }),
        });
      }
      const signed = await opts.gate.signPlan(plan);
      emit({ type: EventType.PLAN_SIGNED, planId: signed.planId });
      return { planId: signed.planId, token: signed.token, user: input.user };
    } catch (err) {
      emit({ type: EventType.ERROR, reason: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return {
    start,
    execute: (session, calls) => executeCalls(context(session.user), session, calls),
    async run(raw) {
      const session = await start(raw);
      return runLoop(
        {
          ...context(session.user),
          provider: opts.provider,
          tools: opts.tools,
          maxTurns: opts.maxTurns,
          ...(opts.system !== undefined && { system: opts.system }),
          ...(opts.maxTokens !== undefined && { maxTokens: opts.maxTokens }),
        },
        session,
        RunInput.parse(raw).task,
      );
    },
  };
}
