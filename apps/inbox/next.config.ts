import { join } from "node:path";

import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:3000";
const demoRunnerUrl = process.env.DEMO_RUNNER_URL ?? "http://localhost:8790";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  typedRoutes: true,
  reactCompiler: true,
  transpilePackages: ["@intentlock/ui"],
  rewrites: async () => [
    { source: "/api/:path*", destination: `${apiUrl}/:path*` },
    { source: "/demo-runner/:path*", destination: `${demoRunnerUrl}/:path*` },
  ],
};

export default nextConfig;
