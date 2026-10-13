import { IntentlockError, Plan, type PlanInput } from "@intentlock/core";
import { z } from "zod";

import { MessageRole } from "../provider/enums/message-role.enum.js";
import type { ChatRequest, LLMProvider, ToolDef } from "../provider/types.js";

export const DECLARE_PLAN = "declare_plan";

export class PlannerError extends IntentlockError {}

const PLANNER_SYSTEM = `You are the planner for an AI agent. You do not perform the task; you declare which tools the agent may use for it.
Call ${DECLARE_PLAN} exactly once with:
- goal: one sentence restating the task.
- steps: one entry per tool the task needs, using only the listed tool names. Leave out every tool the task does not need.
- Pin scope: when the task names a specific repository, recipient, path, branch, issue number or similar target, add an args constraint for that argument on every step that takes it, e.g. {"repo": {"eq": "acme/app"}}. Use {"glob": "..."} only when the task itself names a pattern.
- Set maxCalls to a small number that fits the task, and required: true for steps the task cannot finish without.`;

const CONSTRAINT = {
  type: "object",
  description:
    "Exactly one of: eq (exact value), in (list of allowed values), glob (string pattern), lte, gte.",
  properties: {
    eq: { type: ["string", "number", "boolean"] },
    in: { type: "array", items: { type: ["string", "number", "boolean"] } },
    glob: { type: "string" },
    lte: { type: "number" },
    gte: { type: "number" },
  },
};

export function declarePlanTool(tools: ToolDef[]): ToolDef {
  return {
    name: DECLARE_PLAN,
    description: "Declare the tools the agent may use for this task and how they are scoped.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        steps: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              tool: { type: "string", enum: tools.map((t) => t.name) },
              args: { type: "object", additionalProperties: CONSTRAINT },
              maxCalls: { type: "integer", minimum: 1 },
              required: { type: "boolean" },
            },
            required: ["tool"],
          },
        },
      },
      required: ["goal", "steps"],
    },
  };
}

function plannerPrompt(task: string, tools: ToolDef[]): string {
  const list = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return `Available tools:\n${list}\n\nTask:\n${task}`;
}

function parsePlanCall(
  args: Record<string, unknown>,
  user: string,
  tools: ToolDef[],
): PlanInput | string {
  const known = new Set(tools.map((t) => t.name));
  const parsed = Plan.safeParse({ version: 1, user, goal: args.goal, steps: args.steps });
  if (!parsed.success) return z.prettifyError(parsed.error);
  const unknown = parsed.data.steps.find((s) => !known.has(s.tool));
  if (unknown) return `unknown tool ${unknown.tool}`;
  return parsed.data;
}

export async function planWithModel(
  provider: LLMProvider,
  input: { user: string; task: string; tools: ToolDef[]; maxTokens?: number },
): Promise<PlanInput> {
  const req: ChatRequest = {
    system: PLANNER_SYSTEM,
    messages: [{ role: MessageRole.USER, text: plannerPrompt(input.task, input.tools) }],
    tools: [declarePlanTool(input.tools)],
    toolChoice: { name: DECLARE_PLAN },
    ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
  };
  const problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await provider.chat(req);
      const calls = res.toolCalls.filter((c) => c.name === DECLARE_PLAN);
      if (calls.length !== 1 || res.toolCalls.length !== 1) {
        problems.push(`expected one ${DECLARE_PLAN} call, got ${res.toolCalls.length}`);
        continue;
      }
      const call = calls[0]!;
      if (call.argsError) {
        problems.push(call.argsError);
        continue;
      }
      const plan = parsePlanCall(call.args, input.user, input.tools);
      if (typeof plan === "string") {
        problems.push(plan);
        continue;
      }
      return plan;
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new PlannerError(`Planner failed: ${problems.join("; ")}`);
}
