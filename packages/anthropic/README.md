# @intentlock/anthropic

Claude adapter for the [Intentlock](https://github.com/AbdullahMukadam/intentgate) agent guard. Implements `LLMProvider` from `@intentlock/guard`: maps tools to the Messages API, `tool_use` blocks to tool calls, and results (including blocked calls) to `tool_result` blocks with `is_error`.

```bash
pnpm add @intentlock/guard @intentlock/sdk @intentlock/anthropic
```

```ts
import { AnthropicProvider } from "@intentlock/anthropic";
import { createGuard, toolset } from "@intentlock/guard";

const guard = createGuard({
  provider: new AnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-sonnet-5-5",
  }),
  gate,
  ...toolset(tools),
});
```

Or import `providerFromEnv` from this package instead of `@intentlock/guard` to also accept `LLM_PROVIDER=anthropic` (with `LLM_API_KEY` and `LLM_MODEL`).

License: MIT.
