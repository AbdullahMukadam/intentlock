import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import { MessageRole } from "./enums/message-role.enum.js";
import { ToolChoice } from "./enums/tool-choice.enum.js";
import { toProviderError } from "./provider-error.js";
import { ProviderKind } from "./enums/provider-kind.enum.js";
import type { ChatRequest, ChatResponse, LLMProvider, Message, ToolCallReq } from "./types.js";

export interface OpenAICompatibleOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  client?: Pick<OpenAI, "chat">;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly #model: string;
  readonly #client: Pick<OpenAI, "chat">;

  constructor(opts: OpenAICompatibleOptions) {
    this.name = `${ProviderKind.OPENAI_COMPATIBLE}:${opts.model}`;
    this.#model = opts.model;
    this.#client =
      opts.client ??
      new OpenAI({
        baseURL: opts.baseURL,
        apiKey: opts.apiKey,
        timeout: opts.timeoutMs ?? 60_000,
        maxRetries: 2,
      });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const completion = await this.#client.chat.completions
      .create(toParams(this.#model, req))
      .catch((err: unknown) => {
        throw toProviderError(this.name, err);
      });
    return fromCompletion(completion);
  }
}

export function toParams(model: string, req: ChatRequest): ChatCompletionCreateParamsNonStreaming {
  const messages: ChatCompletionMessageParam[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  for (const m of req.messages) messages.push(...toMessages(m));
  const params: ChatCompletionCreateParamsNonStreaming = { model, messages };
  if (req.tools.length > 0) {
    params.tools = req.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    if (req.toolChoice !== undefined) {
      params.tool_choice =
        req.toolChoice === ToolChoice.AUTO
          ? ToolChoice.AUTO
          : { type: "function", function: { name: req.toolChoice.name } };
    }
  }
  if (req.maxTokens !== undefined) params.max_tokens = req.maxTokens;
  return params;
}

function toMessages(m: Message): ChatCompletionMessageParam[] {
  switch (m.role) {
    case MessageRole.USER:
      return [{ role: "user", content: m.text }];
    case MessageRole.ASSISTANT:
      return [
        {
          role: "assistant",
          content: m.text ?? null,
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: JSON.stringify(c.args) },
                  ...c.providerData,
                })),
              }
            : {}),
        },
      ];
    case MessageRole.TOOL:
      return m.results.map((r) => ({
        role: "tool" as const,
        tool_call_id: r.callId,
        content: r.isError ? `ERROR: ${r.content}` : r.content,
      }));
  }
}

export function fromCompletion(completion: ChatCompletion): ChatResponse {
  const message = completion.choices[0]?.message;
  const toolCalls: ToolCallReq[] = [];
  for (const call of message?.tool_calls ?? []) {
    const id = call.id || `call_${crypto.randomUUID()}`;
    if (call.type !== "function") {
      toolCalls.push({ id, name: call.custom.name, args: {}, argsError: "Unsupported tool type" });
      continue;
    }
    const { extra_content } = call as { extra_content?: unknown };
    toolCalls.push({
      id,
      name: call.function.name,
      ...parseArgs(call.function.arguments),
      ...(extra_content !== undefined && { providerData: { extra_content } }),
    });
  }
  return {
    ...(message?.content ? { text: message.content } : {}),
    toolCalls,
    ...(completion.usage
      ? {
          usage: {
            inputTokens: completion.usage.prompt_tokens,
            outputTokens: completion.usage.completion_tokens,
          },
        }
      : {}),
    raw: completion,
  };
}

export function parseArgs(raw: string | null | undefined): Pick<ToolCallReq, "args" | "argsError"> {
  if (raw === undefined || raw === null || raw.trim() === "") return { args: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { args: {}, argsError: "Arguments are not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { args: {}, argsError: "Arguments must be a JSON object" };
  }
  return { args: parsed as Record<string, unknown> };
}
