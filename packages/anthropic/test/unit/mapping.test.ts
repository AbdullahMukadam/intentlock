import { readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import type { Message as AnthropicMessage } from "@anthropic-ai/sdk/resources/messages";
import { generateSigningKeyPair, parsePolicy } from "@intentlock/core";
import {
  type ChatRequest,
  createGuard,
  defineTool,
  FakeProvider,
  MessageRole,
  ProviderError,
  ToolChoice,
  toolset,
} from "@intentlock/guard";
import { LocalGate } from "@intentlock/sdk";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { AnthropicProvider, providerFromEnv } from "../../src/anthropic-provider.js";
import { fromMessage, toParams } from "../../src/mapping.js";

const fixture = (name: string): AnthropicMessage =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));

function fakeClient(responses: AnthropicMessage[]) {
  const sent: unknown[] = [];
  const client = {
    messages: {
      create: async (params: unknown) => {
        sent.push(structuredClone(params));
        const next = responses.shift();
        if (!next) throw new Error("no more responses");
        return next;
      },
    },
  } as unknown as ConstructorParameters<typeof AnthropicProvider>[0]["client"];
  return { client, sent };
}

describe("toParams", () => {
  test("tool results go back as one user message of tool_result blocks with is_error", () => {
    const req: ChatRequest = {
      system: "Be careful.",
      messages: [
        { role: MessageRole.USER, text: "Triage" },
        {
          role: MessageRole.ASSISTANT,
          text: "Looking.",
          toolCalls: [
            { id: "toolu_1", name: "list_issues", args: { repo: "a/b" } },
            { id: "toolu_2", name: "delete_repo", args: { repo: "a/b" } },
          ],
        },
        {
          role: MessageRole.TOOL,
          results: [
            { callId: "toolu_1", content: "[]", isError: false },
            { callId: "toolu_2", content: "Blocked by Intentlock (not_in_plan)", isError: true },
          ],
        },
      ],
      tools: [{ name: "list_issues", description: "List", inputSchema: { properties: {} } }],
      toolChoice: ToolChoice.AUTO,
    };
    expect(toParams("claude-x", req)).toEqual({
      model: "claude-x",
      max_tokens: 4096,
      system: "Be careful.",
      messages: [
        { role: "user", content: [{ type: "text", text: "Triage" }] },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Looking." },
            { type: "tool_use", id: "toolu_1", name: "list_issues", input: { repo: "a/b" } },
            { type: "tool_use", id: "toolu_2", name: "delete_repo", input: { repo: "a/b" } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "toolu_1", content: "[]", is_error: false },
            {
              type: "tool_result",
              tool_use_id: "toolu_2",
              content: "Blocked by Intentlock (not_in_plan)",
              is_error: true,
            },
          ],
        },
      ],
      tools: [
        {
          name: "list_issues",
          description: "List",
          input_schema: { type: "object", properties: {} },
        },
      ],
      tool_choice: { type: "auto" },
    });
  });

  test("forced tool choice, max tokens, merged user turns, empty parts dropped", () => {
    const params = toParams("m", {
      messages: [
        { role: MessageRole.TOOL, results: [{ callId: "t", content: "", isError: false }] },
        { role: MessageRole.USER, text: "continue" },
        { role: MessageRole.ASSISTANT },
      ],
      tools: [{ name: "declare_plan", description: "d", inputSchema: { type: "object" } }],
      toolChoice: { name: "declare_plan" },
      maxTokens: 100,
    });
    expect(params.tool_choice).toEqual({ type: "tool", name: "declare_plan" });
    expect(params.max_tokens).toBe(100);
    expect(params.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t", is_error: false },
          { type: "text", text: "continue" },
        ],
      },
    ]);
  });
});

describe("fromMessage", () => {
  test("tool_use blocks become tool calls; text and usage carried over", () => {
    expect(fromMessage(fixture("tool-use"))).toMatchObject({
      text: "I'll list the open issues and check the repo.",
      toolCalls: [
        {
          id: "toolu_01A09q90qw90lq917835lq9",
          name: "list_issues",
          args: { repo: "acme-demo/public-app", state: "open" },
        },
        {
          id: "toolu_01B2c3d4e5f6g7h8i9j0k1l2",
          name: "get_repo",
          args: { repo: "acme-demo/public-app" },
        },
      ],
      usage: { inputTokens: 412, outputTokens: 96 },
    });
    expect(fromMessage(fixture("end-turn")).toolCalls).toEqual([]);
  });

  test("non-object input fails closed", () => {
    const msg = fixture("tool-use");
    msg.content = [{ type: "tool_use", id: "x", name: "n", input: "oops" } as never];
    expect(fromMessage(msg).toolCalls[0]).toEqual({
      id: "x",
      name: "n",
      args: {},
      argsError: "Arguments must be a JSON object",
    });
  });
});

test("providerFromEnv builds the Anthropic adapter and still handles the others", () => {
  const p = providerFromEnv({ LLM_PROVIDER: "anthropic", LLM_API_KEY: "k", LLM_MODEL: "claude-x" });
  expect(p).toBeInstanceOf(AnthropicProvider);
  expect(p.name).toBe("anthropic:claude-x");
  expect(providerFromEnv({ LLM_PROVIDER: "fake" })).toBeInstanceOf(FakeProvider);
});

test("a guarded run over recorded Messages API responses", async () => {
  const policy = parsePolicy(`version: 1
default: block
rules:
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`);
  if (!policy.ok) throw new Error("bad policy");
  const gate = new LocalGate({
    privateKey: (await generateSigningKeyPair()).privateKey,
    policies: policy.policy,
  });
  const ran: string[] = [];
  const tool = (name: string) =>
    defineTool({
      name,
      description: name,
      schema: z.object({ repo: z.string(), state: z.string().optional() }),
      impl: async () => {
        ran.push(name);
        return [{ number: 3 }];
      },
    });
  const { client, sent } = fakeClient([
    fixture("declare-plan"),
    fixture("tool-use"),
    fixture("end-turn"),
  ]);
  const guard = createGuard({
    provider: new AnthropicProvider({ apiKey: "", model: "claude-x", client }),
    gate,
    ...toolset([tool("list_issues"), tool("add_label"), tool("get_repo")]),
  });
  const result = await guard.run({
    user: "alice@acme-demo.dev",
    task: "Triage open issues in acme-demo/public-app",
  });
  expect(result.text).toMatch(/Labelled issue #3/);
  expect(ran).toEqual(["list_issues"]);
  const followUp = sent[2] as { messages: { role: string; content: unknown[] }[] };
  expect(followUp.messages.at(-1)).toEqual({
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_01A09q90qw90lq917835lq9",
        content: '[{"number":3}]',
        is_error: false,
      },
      {
        type: "tool_result",
        tool_use_id: "toolu_01B2c3d4e5f6g7h8i9j0k1l2",
        content: expect.stringMatching(/^Blocked by Intentlock \(not_in_plan\)/),
        is_error: true,
      },
    ],
  });
  expect((sent[0] as { tool_choice: unknown }).tool_choice).toEqual({
    type: "tool",
    name: "declare_plan",
  });
});

test.each([
  [new Anthropic.InternalServerError(529, {}, "Overloaded", new Headers()), 529, true],
  [new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", new Headers()), 401, false],
  [new Anthropic.APIConnectionError({ message: "Connection error." }), null, true],
])("chat turns SDK errors into ProviderError: %s", async (sdkError, status, retryable) => {
  const client = {
    messages: { create: () => Promise.reject(sdkError) },
  } as unknown as ConstructorParameters<typeof AnthropicProvider>[0]["client"];
  const provider = new AnthropicProvider({ apiKey: "", model: "claude-x", client });
  const err = await provider
    .chat({ messages: [], tools: [], toolChoice: ToolChoice.AUTO })
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ provider: "anthropic:claude-x", status, retryable, cause: sdkError });
});
