import type { MessageRole } from "./enums/message-role.enum.js";
import type { ToolChoice } from "./enums/tool-choice.enum.js";

export type JSONSchema = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export interface ToolCallReq {
  id: string;
  name: string;
  args: Record<string, unknown>;
  argsError?: string;
  providerData?: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  content: string;
  isError: boolean;
}

export type Message =
  | { role: MessageRole.USER; text: string }
  | { role: MessageRole.ASSISTANT; text?: string; toolCalls?: ToolCallReq[] }
  | { role: MessageRole.TOOL; results: ToolResult[] };

export interface ChatRequest {
  system?: string;
  messages: Message[];
  tools: ToolDef[];
  toolChoice?: ToolChoice.AUTO | { name: string };
  maxTokens?: number;
}

export interface ChatResponse {
  text?: string;
  toolCalls: ToolCallReq[];
  usage?: { inputTokens: number; outputTokens: number };
  raw?: unknown;
}

export interface LLMProvider {
  readonly name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
