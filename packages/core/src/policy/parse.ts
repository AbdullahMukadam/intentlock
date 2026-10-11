import { isNode, LineCounter, parseDocument, type Document } from "yaml";

import { PolicySet } from "../schemas/policy.js";

export interface PolicyError {
  line: number;
  col: number;
  path: string;
  message: string;
}

export type PolicyParseResult =
  { ok: true; policy: PolicySet } | { ok: false; errors: PolicyError[] };

function positionOf(doc: Document, path: readonly PropertyKey[], lines: LineCounter) {
  for (let n = path.length; n >= 0; n--) {
    const node = n === 0 ? doc.contents : doc.getIn(path.slice(0, n), true);
    if (isNode(node) && node.range) return lines.linePos(node.range[0]);
  }
  return { line: 1, col: 1 };
}

/** YAML → validated PolicySet. Errors carry 1-based line/col so the inbox editor can show them inline. */
export function parsePolicy(source: string): PolicyParseResult {
  const lines = new LineCounter();
  const doc = parseDocument(source, { lineCounter: lines, prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length > 0) {
    return {
      ok: false,
      errors: doc.errors.map((e) => ({ ...lines.linePos(e.pos[0]), path: "", message: e.message })),
    };
  }

  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch (err) {
    return { ok: false, errors: [{ line: 1, col: 1, path: "", message: String(err) }] };
  }

  const result = PolicySet.safeParse(value);
  if (result.success) return { ok: true, policy: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path =
        issue.code === "unrecognized_keys" && issue.keys[0] !== undefined
          ? [...issue.path, issue.keys[0]]
          : issue.path;
      return {
        ...positionOf(doc, path, lines),
        path: path.map(String).join("."),
        message: issue.message,
      };
    }),
  };
}
