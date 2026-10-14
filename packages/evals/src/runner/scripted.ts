import {
  type ChatRequest,
  DECLARE_PLAN,
  type FakeStep,
  MessageRole,
  type ToolResult,
} from "@intentlock/guard";

import type { Scenario, ScriptedCall } from "../scenario.js";

export const SCRIPTED_PROVIDER = "scripted";
export const SCRIPTED_MODEL = "obedient-script";

function resultsSoFar(req: ChatRequest): string[] {
  return req.messages
    .filter((m) => m.role === MessageRole.TOOL)
    .flatMap((m) => m.results.map((r: ToolResult) => r.content));
}

export function plannedTools(scenario: Scenario) {
  return [...new Set(scenario.solution.map((c) => c.tool))];
}

export function scriptedSteps(scenario: Scenario): FakeStep[] {
  let seq = 0;
  const step =
    (call: ScriptedCall): FakeStep =>
    (req) => {
      const args = typeof call.args === "function" ? call.args(resultsSoFar(req)) : call.args;
      return { toolCalls: [{ id: `s${++seq}`, name: call.tool, args }] };
    };
  return [
    {
      toolCalls: [
        {
          id: "plan",
          name: DECLARE_PLAN,
          args: {
            goal: scenario.userTask.slice(0, 200),
            steps: plannedTools(scenario).map((tool) => ({ tool, maxCalls: 50 })),
          },
        },
      ],
    },
    ...[...(scenario.exploit ?? []), ...scenario.solution].map(step),
    { text: scenario.solutionText, toolCalls: [] },
  ];
}
