import { GatePlanState, IntentlockError } from "@intentlock/core";
import { z } from "zod";

import { MessageRole } from "../provider/enums/message-role.enum.js";

export const CHECKPOINT_VERSION = 1;

export class CheckpointError extends IntentlockError {}

const ToolCallReq = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  argsError: z.string().optional(),
  providerData: z.record(z.string(), z.unknown()).optional(),
});

const ToolResult = z.object({ callId: z.string(), content: z.string(), isError: z.boolean() });

const Message = z.discriminatedUnion("role", [
  z.object({ role: z.literal(MessageRole.USER), text: z.string() }),
  z.object({
    role: z.literal(MessageRole.ASSISTANT),
    text: z.string().optional(),
    toolCalls: z.array(ToolCallReq).optional(),
  }),
  z.object({ role: z.literal(MessageRole.TOOL), results: z.array(ToolResult) }),
]);

export const Checkpoint = z
  .object({
    version: z.literal(CHECKPOINT_VERSION),
    planId: z.string().min(1),
    token: z.string().min(1),
    user: z.email(),
    turn: z.number().int().positive(),
    savedAt: z.iso.datetime(),
    messages: z.array(Message).min(1),
    results: z.array(ToolResult.nullable()),
    held: z
      .array(
        z.object({
          index: z.number().int().nonnegative(),
          holdId: z.string().min(1),
          ruleId: z.string().nullable(),
        }),
      )
      .min(1),
    gate: GatePlanState.nullable(),
  })
  .superRefine((cp, ctx) => {
    const last = cp.messages.at(-1);
    const calls = last?.role === MessageRole.ASSISTANT ? (last.toolCalls ?? []) : [];
    if (calls.length === 0 || calls.length !== cp.results.length) {
      ctx.addIssue({ code: "custom", path: ["results"], message: "does not match the last turn" });
      return;
    }
    for (const [i, h] of cp.held.entries()) {
      if (cp.results[h.index] !== null) {
        ctx.addIssue({ code: "custom", path: ["held", i], message: "not a held call" });
      }
    }
    const open = cp.results.flatMap((r, i) => (r === null ? [i] : []));
    if (
      open.length !== new Set(cp.held.map((h) => h.index)).size ||
      open.length !== cp.held.length
    ) {
      ctx.addIssue({ code: "custom", path: ["held"], message: "every open call must be held" });
    }
  });
export type Checkpoint = z.output<typeof Checkpoint>;
