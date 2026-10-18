---
title: LLM providers
description: Use any OpenAI-compatible API or Claude, or write your own adapter.
sidebar:
  order: 3
---

The guard only talks to the `LLMProvider` interface, so it works with any model. Provider formats (OpenAI `tool_calls`, Anthropic `tool_use` blocks) stay inside the adapters.

## From the environment

`providerFromEnv()` reads:

```bash title=".env"
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=...
LLM_MODEL=gpt-4o-mini
```

| `LLM_PROVIDER` | Needs |
| --- | --- |
| `openai-compatible` | `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` if the endpoint requires one. |
| `anthropic` | `LLM_API_KEY`, `LLM_MODEL`. Import `providerFromEnv` from `@intentlock/anthropic`. |
| `fake` (default when unset) | Nothing. A scripted provider for tests. |

Any OpenAI-compatible endpoint works: OpenAI, Gemini's OpenAI endpoint, Groq, or Ollama at `http://localhost:11434/v1`.

## Constructing a provider

```ts
import { AnthropicProvider } from "@intentlock/anthropic";
import { OpenAICompatibleProvider } from "@intentlock/guard";

const openai = new OpenAICompatibleProvider({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.LLM_API_KEY!,
  model: "llama-3.3-70b-versatile",
});

const claude = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-sonnet-5-5",
});
```

Both take an optional `timeoutMs`.

## Writing your own adapter

Implement `LLMProvider`: a `name` and a `chat(request)` method. Map your SDK's tool-call format to `ToolCallReq` and back from `ToolResult`, and wrap its errors with `toProviderError(name, err)` so the guard can tell which ones are retryable.

```ts
import type { ChatRequest, ChatResponse, LLMProvider } from "@intentlock/guard";
import { toProviderError } from "@intentlock/guard";

class MyProvider implements LLMProvider {
  readonly name = "my-llm";

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const reply = await myLlm.complete(request);
      return { text: reply.text, toolCalls: reply.toolCalls };
    } catch (err) {
      throw toProviderError(this.name, err);
    }
  }
}
```

A `ToolCallReq` is `{ id, name, args }`; a `ToolResult` is `{ callId, content, isError }`. Every tool call must get exactly one result, and the guard takes care of that.
