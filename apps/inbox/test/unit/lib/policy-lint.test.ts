import { STARTER_POLICY } from "@intentlock/core";
import { expect, test } from "vitest";

import { policyDiagnostics } from "../../../src/lib/policy-lint";

test("a valid policy has no diagnostics", () => {
  expect(policyDiagnostics(STARTER_POLICY)).toEqual([]);
});

test("a schema error points at its line", () => {
  const source = STARTER_POLICY.replace("decision: allow", "decision: maybe");
  const [d] = policyDiagnostics(source);
  const lineOf = (pos: number) => source.slice(0, pos).split("\n").length;
  expect(d?.severity).toBe("error");
  expect(lineOf(d?.from ?? 0)).toBe(lineOf(source.indexOf("maybe")));
});

test("a YAML syntax error stays inside the document", () => {
  const source = "version: 1\nrules: [\n";
  const diagnostics = policyDiagnostics(source);
  expect(diagnostics.length).toBeGreaterThan(0);
  for (const d of diagnostics) {
    expect(d.from).toBeGreaterThanOrEqual(0);
    expect(d.to).toBeLessThanOrEqual(source.length);
  }
});
