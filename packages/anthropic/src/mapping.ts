import type {
  ContentBlockParam,
  Message as AnthropicMessage,
  MessageCreateParamsNonStreaming,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages";
import {
  type ChatRequest,
  type ChatResponse,
  type Message,
  MessageRole,
  ToolChoice,
  type ToolCallReq,
} from "@intentlock/guard";

export const DEFAULT_MAX_TOKENS = 4096;

function toBlocks(m: Message): ContentBlockParam[] {
  switch (m.role) {
    case MessageRole.USER:
      return [{ type: "text", text: m.text }];
    case MessageRole.ASSISTANT:
      return [
        ...(m.text ? [{ type: "text" as const, text: m.text }] : []),
        ...(m.toolCalls ?? []).map((c) => ({
          type: "tool_use" as const,
          id: c.id,
          name: c.name,
          input: c.args,
        })),
      ];
    case MessageRole.TOOL:
      return m.results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.callId,
        ...(r.content && { content: r.content }),
        is_error: r.isError,
      }));
  }
}

export function toMessages(messages: Message[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of messages) {
    const role = m.role === MessageRole.ASSISTANT ? "assistant" : "user";
    const blocks = toBlocks(m);
    if (blocks.length === 0) continue;
    const last = out.at(-1);
    if (last?.role === role && Array.isArray(last.content)) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  }
  return out;
}

export function toParams(model: string, req: ChatRequest): MessageCreateParamsNonStreaming {
  const params: MessageCreateParamsNonStreaming = {
    model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: toMessages(req.messages),
  };
  if (req.system) params.system = req.system;
  if (req.tools.length > 0) {
    params.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: { ...t.inputSchema, type: "object" },
    }));
    if (req.toolChoice !== undefined) {
      params.tool_choice =
        req.toolChoice === ToolChoice.AUTO
          ? { type: "auto" }
          : { type: "tool", name: req.toolChoice.name };
    }
  }
  return params;
}

export function fromMessage(message: AnthropicMessage): ChatResponse {
  const text: string[] = [];
  const toolCalls: ToolCallReq[] = [];
  for (const block of message.content) {
    if (block.type === "text") text.push(block.text);
    if (block.type !== "tool_use") continue;
    const input = block.input;
    toolCalls.push(
      typeof input === "object" && input !== null && !Array.isArray(input)
        ? { id: block.id, name: block.name, args: input as Record<string, unknown> }
        : {
            id: block.id,
            name: block.name,
            args: {},
            argsError: "Arguments must be a JSON object",
          },
    );
  }
  return {
    ...(text.length > 0 && { text: text.join("\n") }),
    toolCalls,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    raw: message,
  };
}
