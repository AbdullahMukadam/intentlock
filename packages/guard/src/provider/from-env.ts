import { IntentlockError } from "@intentlock/core";
import { z } from "zod";

import { ProviderKind } from "./enums/provider-kind.enum.js";
import { FakeProvider, type FakeStep } from "./fake.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { LLMProvider } from "./types.js";

const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());
const required = z.string().min(1);

const LlmEnv = z.discriminatedUnion("LLM_PROVIDER", [
  z.object({
    LLM_PROVIDER: z.literal(ProviderKind.OPENAI_COMPATIBLE),
    LLM_BASE_URL: z.url(),
    LLM_API_KEY: optional,
    LLM_MODEL: required,
  }),
  z.object({
    LLM_PROVIDER: z.literal(ProviderKind.ANTHROPIC),
    LLM_API_KEY: required,
    LLM_MODEL: required,
  }),
  z.object({ LLM_PROVIDER: z.literal(ProviderKind.FAKE) }),
]);

export interface ProviderFromEnvOptions {
  anthropic?: (opts: { apiKey: string; model: string }) => LLMProvider;
  fakeScript?: FakeStep[];
}

export function providerFromEnv(
  env: Record<string, string | undefined> = process.env,
  opts: ProviderFromEnvOptions = {},
): LLMProvider {
  const parsed = LlmEnv.safeParse({ ...env, LLM_PROVIDER: env.LLM_PROVIDER || ProviderKind.FAKE });
  if (!parsed.success) {
    throw new IntentlockError(`Invalid LLM_* environment: ${z.prettifyError(parsed.error)}`);
  }
  const cfg = parsed.data;
  switch (cfg.LLM_PROVIDER) {
    case ProviderKind.OPENAI_COMPATIBLE:
      return new OpenAICompatibleProvider({
        baseURL: cfg.LLM_BASE_URL,
        apiKey: cfg.LLM_API_KEY ?? "none",
        model: cfg.LLM_MODEL,
      });
    case ProviderKind.ANTHROPIC:
      if (!opts.anthropic) {
        throw new IntentlockError(
          "LLM_PROVIDER=anthropic needs providerFromEnv from @intentlock/anthropic",
        );
      }
      return opts.anthropic({ apiKey: cfg.LLM_API_KEY, model: cfg.LLM_MODEL });
    case ProviderKind.FAKE:
      return new FakeProvider(opts.fakeScript);
  }
}
