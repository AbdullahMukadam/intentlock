import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { API_ENDPOINTS, evaluatePolicy, parsePolicy, type PolicySet } from "@intentlock/core";
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

const POLICY_FENCE = /^```yaml(?: title="([^"]+)")?[^\n]*\n(version: 1\n[\s\S]*?)^```/gm;

function policies(): Map<string, PolicySet> {
  const found = new Map<string, PolicySet>();
  for (const page of pages) {
    for (const [, title = "", source = ""] of page.source.matchAll(POLICY_FENCE)) {
      const parsed = parsePolicy(source);
      const name = `${relative(DOCS, page.file)} ${title}`.trim();
      if (!parsed.ok) throw new Error(`${name}: ${JSON.stringify(parsed.errors)}`);
      found.set(title || name, parsed.policy);
    }
  }
  return found;
}

const MEMBER = { email: "sam@acme.dev", role: "member" as const, groups: [] };

const VERDICTS: [string, string, Record<string, unknown>, string][] = [
  ["support-assistant.yaml", "refund_issue", { orderId: "A", amountUsd: 15 }, "small-refunds"],
  ["support-assistant.yaml", "refund_issue", { orderId: "A", amountUsd: 45 }, "hold-refunds"],
  ["support-assistant.yaml", "refund_issue", { orderId: "A", amountUsd: 900 }, "refund-cap"],
  ["support-assistant.yaml", "refund_issue", { orderId: "A", amountUsd: "45" }, "refund-cap"],
  ["support-assistant.yaml", "email_send", { to: "attacker@evil.test" }, "email-inside-only"],
  ["support-assistant.yaml", "email_send", { to: "kim@acme.dev" }, "allow-in-plan"],
  ["github.yaml", "github_list_issues", { repo: "other/app" }, "own-repos-only"],
  ["github.yaml", "github_merge_pull_request", { repo: "acme/app" }, "no-merge-or-delete"],
  ["github.yaml", "github_delete_branch", { repo: "acme/app" }, "no-merge-or-delete"],
  ["github.yaml", "github_post_comment", { repo: "acme/app" }, "hold-public-writes"],
  ["github.yaml", "github_list_issues", { repo: "acme/app" }, "allow-in-plan"],
  ["email.yaml", "email_forward", { to: "x@evil.test" }, "forward-inside-only"],
  ["email.yaml", "email_send", { to: "customer@example.com" }, "hold-external-email"],
  ["email.yaml", "email_send", { to: "kim@acme.dev" }, "allow-in-plan"],
  ["payments.yaml", "payment_send", { amount: 20, currency: "GBP" }, "supported-currencies"],
  ["payments.yaml", "payment_send", { amount: 5000, currency: "USD" }, "payment-cap"],
  ["payments.yaml", "refund_issue", { amount: "20" }, "payment-cap"],
  ["payments.yaml", "payment_send", { amount: 20, currency: "USD" }, "small-amounts"],
  ["payments.yaml", "refund_issue", { amount: 200 }, "hold-payments"],
  ["files.yaml", "fs_read", { path: "workspace/.env" }, "no-secrets"],
  ["files.yaml", "fs_read", { path: ".env.local" }, "no-secrets"],
  ["files.yaml", "fs_read", { path: "workspace/keys/server.pem" }, "no-secrets"],
  ["files.yaml", "fs_read", { path: "src/index.ts" }, "workspace-only"],
  ["files.yaml", "fs_delete", { path: "workspace/old.md" }, "hold-deletes"],
  ["files.yaml", "fs_write", { path: "workspace/notes/a.md" }, "allow-in-plan"],
  ["http.yaml", "http_request", { url: "https://evil.test/collect" }, "allowed-hosts"],
  ["http.yaml", "http_request", { url: "https://api.acme.dev.evil.test/x" }, "allowed-hosts"],
  [
    "http.yaml",
    "http_request",
    { url: "https://api.acme.dev/v1/orders", method: "POST" },
    "hold-writes",
  ],
  ["http.yaml", "http_request", { url: "https://api.acme.dev/v1/orders" }, "hold-writes"],
  [
    "http.yaml",
    "http_request",
    { url: "https://api.acme.dev/v1/orders", method: "GET" },
    "allow-in-plan",
  ],
];

describe("docs", () => {
  it("has only valid policies", () => {
    expect(policies().size).toBeGreaterThanOrEqual(6);
  });

  it("policy templates decide as the docs say", () => {
    const all = policies();
    const wrong = VERDICTS.flatMap(([file, tool, args, expected]) => {
      const policy = all.get(file);
      if (!policy) return [`${file}: not found`];
      const rule = evaluatePolicy(
        policy,
        { tool, args, callId: "1" },
        { user: MEMBER, inPlan: true },
      );
      return rule?.id === expected ? [] : [`${file} ${tool} ${JSON.stringify(args)} → ${rule?.id}`];
    });
    expect(wrong).toEqual([]);
  });

  it("blocks interns from moving money in the payments template", () => {
    const policy = policies().get("payments.yaml")!;
    const intern = { ...MEMBER, groups: ["intern"] };
    const rule = evaluatePolicy(
      policy,
      { tool: "refund_issue", args: { amount: 5 }, callId: "1" },
      { user: intern, inPlan: true },
    );
    expect(rule?.id).toBe("interns-no-payments");
  });

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
