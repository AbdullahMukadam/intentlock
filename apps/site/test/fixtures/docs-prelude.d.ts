import type {
  ChatRequest,
  ChatResponse,
  CheckpointStore,
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
  const orders: { get(orderId: string): Promise<unknown> };
  const mailer: { send(args: { to: string; subject: string; body: string }): Promise<unknown> };
  const payments: { refund(args: { orderId: string; amountUsd: number }): Promise<unknown> };
  const myLlm: { complete(request: ChatRequest): Promise<ChatResponse> };
  const provider: LLMProvider;
  const gate: Gate;
  const guard: Guard;
  const store: CheckpointStore;
  const tools: GuardTool[];
  const lookupOrder: GuardTool;
  const sendEmail: GuardTool;
  const issueRefund: GuardTool;
  const toolCalls: ToolCallReq[];
  const user: string;
  const task: string;
  const repo: string;
  function scheduleRetry(planId: string | undefined): void;
}
