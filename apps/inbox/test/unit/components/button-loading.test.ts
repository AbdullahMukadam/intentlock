import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const SRC = fileURLToPath(new URL("../../../src", import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(path);
    return e.name.endsWith(".tsx") ? [path] : [];
  });
}

function buttonTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<Button\b/g)) {
    let depth = 0;
    let i = match.index + match[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(source.slice(match.index, i + 1));
  }
  return tags;
}

describe("action buttons", () => {
  test("every Button that runs an async handler shows a loading state", () => {
    const missing: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      const handlers = [...source.matchAll(/async function (\w+)\(/g)].map((m) => m[1]);
      for (const tag of buttonTags(source)) {
        const onClick = /onClick=\{([^]*?)\}\s*(?:\w+=|\/?>)/.exec(tag)?.[1] ?? "";
        const runsAsync = handlers.some((h) => new RegExp(`\\b${h}\\b`).test(onClick));
        if (runsAsync && !tag.includes("loading=")) {
          missing.push(`${file.slice(SRC.length + 1)}: ${tag.replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
