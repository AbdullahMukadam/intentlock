import { expect, test } from "vitest";

import { FakeProvider } from "./fake.js";
import { providerFromEnv } from "./from-env.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

test("openai-compatible from env", () => {
  const p = providerFromEnv({
    LLM_PROVIDER: "openai-compatible",
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_API_KEY: "",
    LLM_MODEL: "qwen3:8b",
  });
  expect(p).toBeInstanceOf(OpenAICompatibleProvider);
  expect(p.name).toBe("openai-compatible:qwen3:8b");
});

test("fake is the default", () => {
  expect(providerFromEnv({})).toBeInstanceOf(FakeProvider);
  expect(providerFromEnv({ LLM_PROVIDER: "" })).toBeInstanceOf(FakeProvider);
});

test("anthropic needs the adapter factory", () => {
  const env = { LLM_PROVIDER: "anthropic", LLM_API_KEY: "k", LLM_MODEL: "claude" };
  expect(() => providerFromEnv(env)).toThrow(/@intentlock\/anthropic/);
  const fake = new FakeProvider();
  expect(providerFromEnv(env, { anthropic: () => fake })).toBe(fake);
});

test("invalid env fails loudly", () => {
  expect(() => providerFromEnv({ LLM_PROVIDER: "openai-compatible", LLM_MODEL: "m" })).toThrow(
    /LLM_BASE_URL/,
  );
  expect(() => providerFromEnv({ LLM_PROVIDER: "gpt" })).toThrow(/Invalid LLM_/);
  expect(() => providerFromEnv({ LLM_PROVIDER: "anthropic", LLM_MODEL: "m" })).toThrow(
    /LLM_API_KEY/,
  );
});
