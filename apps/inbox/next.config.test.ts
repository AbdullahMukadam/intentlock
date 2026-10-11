import { expect, test } from "vitest";

import nextConfig from "./next.config";

test("shared UI package is transpiled", () => {
  expect(nextConfig.transpilePackages).toContain("@intentlock/ui");
});
