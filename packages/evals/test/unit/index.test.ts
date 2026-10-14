import { expect, test } from "vitest";

test("package entry loads", async () => {
  await expect(import("../../src/index.js")).resolves.toBeDefined();
});
