import { describe, expect, test } from "vitest";

import { upstreamEnv } from "../../src/upstream-env.js";

describe("upstreamEnv", () => {
  test("never passes Intentlock variables to the upstream server", () => {
    const env = upstreamEnv({
      GITHUB_TOKEN: "ghp_x",
      INTENTLOCK_API_KEY: "il_live_x",
      INTENTLOCK_URL: "u",
    });
    expect(env.GITHUB_TOKEN).toBe("ghp_x");
    expect(Object.keys(env).filter((k) => k.startsWith("INTENTLOCK_"))).toEqual([]);
  });
});
