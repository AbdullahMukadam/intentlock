import { describe, expect, it } from "vitest";

import { codeTitle } from "../../../src/lib/code-frame";

describe("codeTitle", () => {
  it("uses the title from the fence meta", () => {
    expect(codeTitle('title="agent.ts"', "ts")).toBe("agent.ts");
  });

  it("falls back to a language label, then the language", () => {
    expect(codeTitle("", "bash")).toBe("Terminal");
    expect(codeTitle("", "toml")).toBe("toml");
  });
});
