import { expect, test } from "vitest";

import { DemoAgent } from "../../src/enums/demo-agent.enum.js";
import { hasValue, keyVar, upsertEnv } from "../../src/env-file.js";

test("keyVar matches the env schema's variable", () => {
  expect(keyVar(DemoAgent.GITHUB_ASSISTANT)).toBe("INTENTLOCK_API_KEY_GITHUB_ASSISTANT");
});

test("upsertEnv replaces an existing line and keeps the rest", () => {
  const text = "A=1\nKEY=old\nB=2\n";
  expect(upsertEnv(text, "KEY", "il_live_$&x")).toBe("A=1\nKEY=il_live_$&x\nB=2\n");
});

test("upsertEnv appends to a file without a trailing newline", () => {
  expect(upsertEnv("A=1", "KEY", "v")).toBe("A=1\nKEY=v\n");
  expect(upsertEnv("", "KEY", "v")).toBe("KEY=v\n");
});

test("hasValue ignores empty assignments", () => {
  expect(hasValue("KEY=\n", "KEY")).toBe(false);
  expect(hasValue("KEY=abc\n", "KEY")).toBe(true);
});
