import { MessageRole } from "../provider/enums/message-role.enum.js";
import { ToolChoice } from "../provider/enums/tool-choice.enum.js";
import type { LLMProvider, Message, ToolDef } from "../provider/types.js";
import { RunStatus } from "./enums/run-status.enum.js";
import { executeCalls, type ExecuteContext, type GuardSession } from "./execute.js";

export interface RunResult {
  status: RunStatus;
  planId: string;
  text?: string;
  turns: number;
  messages: Message[];
}

export interface LoopContext extends ExecuteContext {
  provider: LLMProvider;
  tools: ToolDef[];
  maxTurns: number;
  system?: string;
  maxTokens?: number;
}

export async function runLoop(
  ctx: LoopContext,
  session: GuardSession,
  task: string,
): Promise<RunResult> {
  const messages: Message[] = [{ role: MessageRole.USER, text: task }];
  let text: string | undefined;
  for (let turn = 1; turn <= ctx.maxTurns; turn++) {
    const res = await ctx.provider.chat({
      ...(ctx.system !== undefined && { system: ctx.system }),
      messages,
      tools: ctx.tools,
      toolChoice: ToolChoice.AUTO,
      ...(ctx.maxTokens !== undefined && { maxTokens: ctx.maxTokens }),
    });
    text = res.text;
    messages.push({
      role: MessageRole.ASSISTANT,
      ...(res.text !== undefined && { text: res.text }),
      ...(res.toolCalls.length > 0 && { toolCalls: res.toolCalls }),
    });
    if (res.toolCalls.length === 0) {
      return {
        status: RunStatus.COMPLETED,
        planId: session.planId,
        ...(text !== undefined && { text }),
        turns: turn,
        messages,
      };
    }
    messages.push({
      role: MessageRole.TOOL,
      results: await executeCalls(ctx, session, res.toolCalls),
    });
  }
  return {
    status: RunStatus.MAX_TURNS,
    planId: session.planId,
    ...(text !== undefined && { text }),
    turns: ctx.maxTurns,
    messages,
  };
}
