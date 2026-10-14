import { expect, test } from "vitest";

import nextConfig from "./next.config";

test("shared UI package is transpiled", () => {
  expect(nextConfig.transpilePackages).toContain("@intentlock/ui");
});

test("/api is rewritten to the server so the session cookie stays same-origin", async () => {
  expect(await nextConfig.rewrites?.()).toEqual([
    { source: "/api/:path*", destination: "http://localhost:3000/:path*" },
    { source: "/demo-runner/:path*", destination: "http://localhost:8790/:path*" },
  ]);
});
