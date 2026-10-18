import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { API_ENDPOINTS } from "@intentlock/core";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SITE = fileURLToPath(new URL("../../../", import.meta.url));
const DOCS = join(SITE, "src", "content", "docs", "docs");
const PRELUDE = join(SITE, "test", "fixtures", "docs-prelude.d.ts");
const FENCE = /^```(\w*)[^\n]*\n([\s\S]*?)^```/gm;

interface Page {
  file: string;
  route: string;
  source: string;
  prose: string;
}

function route(file: string): string {
  const slug = relative(DOCS, file)
    .split(sep)
    .join("/")
    .replace(/\.mdx?$/, "");
  return slug === "index" ? "/docs/" : `/docs/${slug.replace(/\/index$/, "")}/`;
}

const pages: Page[] = readdirSync(DOCS, { recursive: true, encoding: "utf8" })
  .filter((name) => /\.mdx?$/.test(name))
  .map((name) => {
    const file = join(DOCS, name);
    const source = readFileSync(file, "utf8");
    return { file, route: route(file), source, prose: source.replace(FENCE, "") };
  });

function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchors(page: Page): Set<string> {
  const headings = [...page.prose.matchAll(/^#{2,6}\s+(.+)$/gm)].map((m) => m[1] ?? "");
  return new Set(headings.map(slugify));
}

function samples() {
  return pages.flatMap((page) =>
    [...page.source.matchAll(FENCE)]
      .filter((m) => m[1] === "ts" || m[1] === "typescript")
      .map((m, i) => ({
        page,
        name: join(SITE, "__docs__", `${relative(DOCS, page.file).replace(/[\\/.]/g, "_")}_${i}.ts`)
          .split(sep)
          .join("/"),
        code: m[2] ?? "",
      })),
  );
}

describe("docs", () => {
  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it("has only internal links that resolve, including anchors", () => {
    const byRoute = new Map(pages.map((p) => [p.route, p]));
    const broken: string[] = [];
    for (const page of pages) {
      for (const [, href = ""] of page.prose.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        const [path = "", hash] = href.split("#");
        if (path === "/") continue;
        const target = byRoute.get(path);
        if (!target) broken.push(`${page.route} → ${href} (no page)`);
        else if (hash && !anchors(target).has(hash))
          broken.push(`${page.route} → ${href} (no heading)`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("type-checks every TypeScript sample against the packages", () => {
    const files = new Map(samples().map((s) => [s.name, s]));
    expect(files.size).toBeGreaterThan(5);

    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      moduleDetection: ts.ModuleDetectionKind.Force,
      lib: ["lib.es2023.d.ts", "lib.dom.d.ts"],
      types: ["node"],
    };
    const host = ts.createCompilerHost(options);
    const { getSourceFile, fileExists, readFile } = host;
    host.fileExists = (name) => files.has(name) || fileExists(name);
    host.readFile = (name) => files.get(name)?.code ?? readFile(name);
    host.getSourceFile = (name, version, ...rest) => {
      const sample = files.get(name);
      return sample
        ? ts.createSourceFile(name, sample.code, version)
        : getSourceFile(name, version, ...rest);
    };

    const program = ts.createProgram([PRELUDE, ...files.keys()], options, host);
    const errors = ts.getPreEmitDiagnostics(program).map((d) => {
      const sample = d.file && files.get(d.file.fileName);
      const where =
        sample && d.start !== undefined
          ? d.file?.getLineAndCharacterOfPosition(d.start)
          : undefined;
      const label = sample
        ? `${relative(DOCS, sample.page.file)}:${(where?.line ?? 0) + 1}`
        : d.file?.fileName;
      return `${label}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
    });
    expect(errors).toEqual([]);
  }, 180_000);

  it("documents every API endpoint", () => {
    const api = pages.find((p) => p.route === "/docs/reference/http-api/");
    const missing = Object.values(API_ENDPOINTS).filter(
      (path) =>
        !new RegExp(`\`${path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}[\`?]`).test(
          api?.source ?? "",
        ),
    );
    expect(missing).toEqual([]);
  });
});
