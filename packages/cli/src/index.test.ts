import { expect, test } from "vitest";

test("package entry loads", async () => {
  await expect(import("./index.js")).resolves.toBeDefined();
});
