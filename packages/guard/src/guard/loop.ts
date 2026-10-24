import { MessageRole } from "../provider/enums/message-role.enum.js";
import { ToolChoice } from "../provider/enums/tool-choice.enum.js";
import { toProviderError } from "../provider/provider-error.js";
import type { ChatResponse, LLMProvider, Message, ToolDef, ToolResult } from "../provider/types.js";
import { type Checkpoint, CHECKPOINT_VERSION } from "./checkpoint.js";
import { EventType } from "./enums/event-type.enum.js";
import { HoldMode } from "./enums/hold-mode.enum.js";
import { RunStatus } from "./enums/run-status.enum.js";
import { executeTurn, type ExecuteContext, type GuardSession } from "./execute.js";

export interface RunResult {
  status: RunStatus;
  planId: string;
  text?: string;
  turns: number;
  messages: Message[];
  holdIds?: string[];
  checkpoint?: Checkpoint;
}

export interface LoopContext extends ExecuteContext {
  provider: LLMProvider;
  tools: ToolDef[];
  maxTurns: number;
  holdMode: HoldMode;
  system?: string;
  maxTokens?: number;
}

export async function runLoop(
  ctx: LoopContext,
  session: GuardSession,
  messages: Message[],
  firstTurn = 1,
): Promise<RunResult> {
  let text: string | undefined;
  for (let turn = firstTurn; turn <= ctx.maxTurns; turn++) {
    let res: ChatResponse;
    try {
      res = await ctx.provider.chat({
        ...(ctx.system !== undefined && { system: ctx.system }),
        messages,
        tools: ctx.tools,
        toolChoice: ToolChoice.AUTO,
        ...(ctx.maxTokens !== undefined && { maxTokens: ctx.maxTokens }),
      });
    } catch (err) {
      const failure = toProviderError(ctx.provider.name, err).withRun(session.planId, [
        ...messages,
      ]);
      ctx.emit({ type: EventType.ERROR, planId: session.planId, reason: failure.message });
      throw failure;
    }
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
    const { results, held } = await executeTurn(
      ctx,
      session,
      res.toolCalls,
      ctx.holdMode === HoldMode.SUSPEND,
    );
    if (held.length > 0) {
      const checkpoint: Checkpoint = {
        version: CHECKPOINT_VERSION,
        planId: session.planId,
        token: session.token,
        user: session.user,
        turn,
        savedAt: ctx.now().toISOString(),
        messages,
        results,
        held,
        gate: (await ctx.gate.exportPlan?.(session.planId)) ?? null,
      };
      return suspendedResult(checkpoint);
    }
    messages.push({ role: MessageRole.TOOL, results: results as ToolResult[] });
  }
  return {
    status: RunStatus.MAX_TURNS,
    planId: session.planId,
    ...(text !== undefined && { text }),
    turns: ctx.maxTurns,
    messages,
  };
}

export function suspendedResult(checkpoint: Checkpoint): RunResult {
  return {
    status: RunStatus.SUSPENDED,
    planId: checkpoint.planId,
    turns: checkpoint.turn,
    messages: checkpoint.messages as Message[],
    holdIds: checkpoint.held.map((h) => h.holdId),
    checkpoint,
  };
}
