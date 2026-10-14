import { type ChatRequest, MessageRole, type ToolResult } from "@intentlock/guard";

export const FORCED_LABEL =
  "DEMO_FORCE_ATTACK: scripted model (FakeProvider) emitting the injected calls";

let callSeq = 0;

export const call = (name: string, args: Record<string, unknown>) => ({
  id: `forced_${++callSeq}`,
  name,
  args,
});

export function lastResults(req: ChatRequest): ToolResult[] {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m?.role === MessageRole.TOOL) return m.results;
  }
  return [];
}

export const lastResult = (req: ChatRequest) => lastResults(req).at(-1);

export function parsed<T>(result: ToolResult | undefined, fallback: T): T {
  return result && !result.isError ? (JSON.parse(result.content) as T) : fallback;
}
