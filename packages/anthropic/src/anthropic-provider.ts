import Anthropic from "@anthropic-ai/sdk";
import {
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
  ProviderKind,
  providerFromEnv as guardProviderFromEnv,
  type ProviderFromEnvOptions,
} from "@intentlock/guard";

import { fromMessage, toParams } from "./mapping.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  client?: Pick<Anthropic, "messages">;
}

export class AnthropicProvider implements LLMProvider {
  readonly name: string;
  readonly #model: string;
  readonly #client: Pick<Anthropic, "messages">;

  constructor(opts: AnthropicProviderOptions) {
    this.name = `${ProviderKind.ANTHROPIC}:${opts.model}`;
    this.#model = opts.model;
    this.#client =
      opts.client ??
      new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? 60_000, maxRetries: 2 });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    return fromMessage(await this.#client.messages.create(toParams(this.#model, req)));
  }
}

export function providerFromEnv(
  env: Record<string, string | undefined> = process.env,
  opts: Omit<ProviderFromEnvOptions, "anthropic"> = {},
): LLMProvider {
  return guardProviderFromEnv(env, { ...opts, anthropic: (c) => new AnthropicProvider(c) });
}
