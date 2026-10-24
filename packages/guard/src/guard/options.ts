import { TOOL_NAME } from "@intentlock/core";
import type { Gate } from "@intentlock/sdk";
import { z } from "zod";

import type { LLMProvider } from "../provider/types.js";
import { HoldMode } from "./enums/hold-mode.enum.js";
import { PlanSource } from "./enums/plan-source.enum.js";
import type { GuardEvent } from "./events.js";
import { DECLARE_PLAN } from "./planner.js";

export type ToolImpl = (args: Record<string, unknown>) => Promise<unknown>;

const isFn = (v: unknown) => typeof v === "function";
const hasMethods =
  (...names: string[]) =>
  (v: unknown) =>
    typeof v === "object" &&
    v !== null &&
    names.every((n) => isFn((v as Record<string, unknown>)[n]));

export const DEFAULT_HOLD_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_TURNS = 20;

export const GuardOptions = z
  .object({
    provider: z.custom<LLMProvider>(hasMethods("chat"), "provider must implement LLMProvider"),
    gate: z.custom<Gate>(
      hasMethods("signPlan", "refresh", "check", "waitForHold", "report"),
      "gate must implement Gate",
    ),
    tools: z
      .array(
        z.object({
          name: z
            .string()
            .regex(TOOL_NAME)
            .refine((n) => n !== DECLARE_PLAN, "reserved name"),
          description: z.string(),
          inputSchema: z.record(z.string(), z.unknown()),
        }),
      )
      .min(1),
    impls: z.record(z.string(), z.custom<ToolImpl>(isFn, "impl must be a function")),
    planSource: z.enum(PlanSource).default(PlanSource.PLANNER),
    onHold: z.enum(HoldMode).default(HoldMode.WAIT),
    holdTimeoutMs: z.number().int().positive().default(DEFAULT_HOLD_TIMEOUT_MS),
    maxTurns: z.number().int().positive().default(DEFAULT_MAX_TURNS),
    system: z.string().optional(),
    maxTokens: z.number().int().positive().optional(),
    onEvent: z.custom<(e: GuardEvent) => void>(isFn).optional(),
    now: z.custom<() => Date>(isFn).optional(),
  })
  .superRefine((o, ctx) => {
    if (o.onHold === HoldMode.SUSPEND && typeof o.gate.holdInfo !== "function") {
      ctx.addIssue({
        code: "custom",
        path: ["gate"],
        message: "onHold suspend needs a gate that can look up holds (HttpGate or HybridGate)",
      });
    }
    const names = o.tools.map((t) => t.name);
    for (const [i, name] of names.entries()) {
      if (names.indexOf(name) !== i) {
        ctx.addIssue({ code: "custom", path: ["tools", i, "name"], message: `duplicate ${name}` });
      }
      if (!Object.hasOwn(o.impls, name)) {
        ctx.addIssue({ code: "custom", path: ["impls", name], message: `no impl for ${name}` });
      }
    }
  });

export type GuardOptionsInput = z.input<typeof GuardOptions>;
export type GuardConfig = z.output<typeof GuardOptions>;
