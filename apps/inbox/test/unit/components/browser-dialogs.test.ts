import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const SRC = fileURLToPath(new URL("../../../src", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

describe("browser dialogs", () => {
  test("the inbox never uses window.prompt, window.confirm or window.alert", () => {
    const found = sourceFiles(SRC).flatMap((file) =>
      /\b(?:window\.)?(?:prompt|confirm|alert)\s*\(/.test(
        readFileSync(file, "utf8").replace(/\bon(?:Confirm|Alert)\b/g, ""),
      )
        ? [relative(SRC, file)]
        : [],
    );
    expect(found).toEqual([]);
  });
});
