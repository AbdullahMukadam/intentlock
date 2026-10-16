import type {
  ChatCompletion,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import OpenAI from "openai";
import { describe, expect, test } from "vitest";

import { MessageRole } from "../../../src/provider/enums/message-role.enum.js";
import { ToolChoice } from "../../../src/provider/enums/tool-choice.enum.js";
import { ProviderError } from "../../../src/provider/provider-error.js";
import {
  fromCompletion,
  OpenAICompatibleProvider,
  parseArgs,
  toParams,
} from "../../../src/provider/openai-compatible.js";
import type { ChatRequest } from "../../../src/provider/types.js";

const recorded: ChatCompletion = {
  id: "chatcmpl-abc",
  object: "chat.completion",
  created: 1760000000,
  model: "gemini-2.5-flash",
  choices: [
    {
      index: 0,
      finish_reason: "tool_calls",
      logprobs: null,
      message: {
        role: "assistant",
        content: null,
        refusal: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "list_issues", arguments: '{"repo":"acme-demo/public-app"}' },
            extra_content: { google: { thought_signature: "sig-1" } },
          } as ChatCompletionMessageToolCall,
          { id: "call_2", type: "function", function: { name: "add_label", arguments: "{bad" } },
          { id: "", type: "function", function: { name: "get_repo", arguments: "" } },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
};

const request: ChatRequest = {
  system: "You are careful.",
  messages: [
    { role: MessageRole.USER, text: "Triage issues" },
    {
      role: MessageRole.ASSISTANT,
      toolCalls: [{ id: "call_1", name: "list_issues", args: { repo: "a/b" } }],
    },
    {
      role: MessageRole.TOOL,
      results: [{ callId: "call_1", content: "Blocked by Intentlock", isError: true }],
    },
  ],
  tools: [{ name: "list_issues", description: "List issues", inputSchema: { type: "object" } }],
  toolChoice: { name: "list_issues" },
  maxTokens: 512,
};

describe("toParams", () => {
  test("maps system, history, tools, forced choice and tool results", () => {
    expect(toParams("m", request)).toEqual({
      model: "m",
      max_tokens: 512,
      messages: [
        { role: "system", content: "You are careful." },
        { role: "user", content: "Triage issues" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "list_issues", arguments: '{"repo":"a/b"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "ERROR: Blocked by Intentlock" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "list_issues",
            description: "List issues",
            parameters: { type: "object" },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "list_issues" } },
    });
  });

  test("auto choice and no tools", () => {
    expect(toParams("m", { ...request, toolChoice: ToolChoice.AUTO }).tool_choice).toBe("auto");
    const bare = toParams("m", { messages: [], tools: [], toolChoice: ToolChoice.AUTO });
    expect(bare.tools).toBeUndefined();
    expect(bare.tool_choice).toBeUndefined();
  });
});

describe("fromCompletion", () => {
  test("parses tool calls, fails closed on bad JSON, fills missing ids", () => {
    const res = fromCompletion(recorded);
    expect(res.toolCalls).toEqual([
      {
        id: "call_1",
        name: "list_issues",
        args: { repo: "acme-demo/public-app" },
        providerData: { extra_content: { google: { thought_signature: "sig-1" } } },
      },
      { id: "call_2", name: "add_label", args: {}, argsError: "Arguments are not valid JSON" },
      { id: expect.stringMatching(/^call_[0-9a-f-]{36}$/), name: "get_repo", args: {} },
    ]);
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
    expect(res.text).toBeUndefined();
  });

  test("text-only answer has no tool calls", () => {
    const done = structuredClone(recorded);
    done.choices[0]!.message = { role: "assistant", content: "All done.", refusal: null };
    expect(fromCompletion(done)).toMatchObject({ text: "All done.", toolCalls: [] });
  });
});

test("Gemini thought signatures survive the round trip", () => {
  const [first] = fromCompletion(recorded).toolCalls;
  const params = toParams("m", {
    messages: [{ role: MessageRole.ASSISTANT, toolCalls: [first!] }],
    tools: [],
  });
  expect(params.messages[0]).toEqual({
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: { name: "list_issues", arguments: '{"repo":"acme-demo/public-app"}' },
        extra_content: { google: { thought_signature: "sig-1" } },
      },
    ],
  });
});

test("parseArgs rejects non-object JSON", () => {
  expect(parseArgs("[1]").argsError).toBe("Arguments must be a JSON object");
  expect(parseArgs("null").argsError).toBe("Arguments must be a JSON object");
  expect(parseArgs('{"a":1}')).toEqual({ args: { a: 1 } });
});

test.each([
  [new OpenAI.RateLimitError(429, {}, "Rate limit reached", new Headers()), 429, true],
  [new OpenAI.AuthenticationError(401, {}, "Incorrect API key", new Headers()), 401, false],
  [new OpenAI.APIConnectionError({ message: "Connection error." }), null, true],
])("chat turns SDK errors into ProviderError: %s", async (sdkError, status, retryable) => {
  const client = {
    chat: { completions: { create: () => Promise.reject(sdkError) } },
  } as unknown as ConstructorParameters<typeof OpenAICompatibleProvider>[0]["client"];
  const provider = new OpenAICompatibleProvider({ baseURL: "", apiKey: "", model: "m", client });
  const err = await provider.chat(request).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({
    provider: "openai-compatible:m",
    status,
    retryable,
    cause: sdkError,
  });
  expect((err as ProviderError).message).toBe(`openai-compatible:m failed: ${sdkError.message}`);
});

test("chat sends mapped params through the client", async () => {
  const sent: unknown[] = [];
  const client = {
    chat: {
      completions: {
        create: async (params: unknown) => {
          sent.push(params);
          return recorded;
        },
      },
    },
  } as unknown as ConstructorParameters<typeof OpenAICompatibleProvider>[0]["client"];
  const provider = new OpenAICompatibleProvider({ baseURL: "", apiKey: "", model: "m", client });
  const res = await provider.chat(request);
  expect(provider.name).toBe("openai-compatible:m");
  expect(sent).toEqual([toParams("m", request)]);
  expect(res.toolCalls).toHaveLength(3);
});
