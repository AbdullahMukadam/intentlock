import { describe, expect, test } from "vitest";

import { describeUserAgent } from "../../../src/lib/user-agent";

describe("describeUserAgent", () => {
  test.each([
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      "Safari on macOS",
    ],
    ["node", "Command line"],
    [null, "Unknown device"],
  ])("%s", (ua, label) => {
    expect(describeUserAgent(ua)).toBe(label);
  });
});
