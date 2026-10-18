import type { AstroUserConfig } from "astro";

type ShikiConfig = NonNullable<NonNullable<AstroUserConfig["markdown"]>["shikiConfig"]>;
type Transformer = NonNullable<ShikiConfig["transformers"]>[number];

const LABELS: Record<string, string> = {
  bash: "Terminal",
  json: "JSON",
  ts: "TypeScript",
  typescript: "TypeScript",
  txt: "Output",
  yaml: "YAML",
};

const ICONS = {
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4"],
  terminal: ["m4 17 6-6-6-6", "M12 19h8"],
  copy: [
    "M8 10a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2Z",
    "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  ],
  check: ["M20 6 9 17l-5-5"],
};

const svg = (paths: string[], className: string) => ({
  type: "element" as const,
  tagName: "svg",
  properties: {
    className: [className],
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ariaHidden: "true",
  },
  children: paths.map((d) => ({
    type: "element" as const,
    tagName: "path",
    properties: { d },
    children: [],
  })),
});

export function codeTitle(meta: string, lang: string): string {
  return /title="([^"]+)"/.exec(meta)?.[1] ?? LABELS[lang] ?? lang;
}

export const codeFrame: Transformer = {
  name: "intentlock:code-frame",
  root(root) {
    const lang = this.options.lang;
    const meta = this.options.meta?.__raw ?? "";
    const title = codeTitle(meta, lang);
    const terminal = lang === "bash" && !meta.includes("title=");
    root.children = [
      {
        type: "element",
        tagName: "figure",
        properties: { className: ["code-frame"] },
        children: [
          {
            type: "element",
            tagName: "figcaption",
            properties: {},
            children: [
              svg(terminal ? ICONS.terminal : ICONS.file, "frame-icon"),
              {
                type: "element",
                tagName: "span",
                properties: {},
                children: [{ type: "text", value: title }],
              },
              {
                type: "element",
                tagName: "button",
                properties: { type: "button", dataCopy: "", ariaLabel: "Copy code" },
                children: [svg(ICONS.copy, "copy-icon"), svg(ICONS.check, "check-icon")],
              },
            ],
          },
          ...root.children.filter((node) => node.type === "element"),
        ],
      },
    ];
  },
};
