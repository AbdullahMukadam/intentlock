import type {
  ChatRequest,
  ChatResponse,
  Guard,
  GuardTool,
  LLMProvider,
  ToolCallReq,
} from "@intentlock/guard";
import type { Gate } from "@intentlock/sdk";

declare global {
  const github: {
    listIssues(repo: string): Promise<unknown>;
    postComment(args: { repo: string; issue: number; body: string }): Promise<unknown>;
  };
  const myLlm: { complete(request: ChatRequest): Promise<ChatResponse> };
  const provider: LLMProvider;
  const gate: Gate;
  const guard: Guard;
  const tools: GuardTool[];
  const toolCalls: ToolCallReq[];
  const user: string;
  const task: string;
  const repo: string;
  function scheduleRetry(planId: string | undefined): void;
}
