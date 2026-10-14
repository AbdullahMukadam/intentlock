import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    projects: [
      { extends: true, test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["test/e2e/**/*.e2e.test.ts"],
          globalSetup: ["test/e2e/global-setup.ts"],
          setupFiles: ["test/e2e/setup.ts"],
          // One shared test database: files must not truncate tables under each other.
          fileParallelism: false,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
