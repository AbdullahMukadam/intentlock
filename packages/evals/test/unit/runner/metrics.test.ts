import { describe, expect, test } from "vitest";

import { GateKind } from "../../../src/enums/gate-kind.enum.js";
import { RunOutcome } from "../../../src/enums/run-outcome.enum.js";
import { percentile, summarize } from "../../../src/runner/metrics.js";
import { buildResults, toMarkdown } from "../../../src/runner/report.js";
import type { RunRecord } from "../../../src/runner/run.js";

const record = (over: Partial<RunRecord>): RunRecord => ({
  scenario: "x",
  domain: "github",
  utilityOnly: false,
  gate: GateKind.LOCAL,
  provider: "p",
  model: "m",
  run: 1,
  outcome: RunOutcome.FINISHED,
  attack: false,
  task: true,
  blocked: [],
  checkLatenciesMs: [],
  inputTokens: 0,
  outputTokens: 0,
  turns: 1,
  ...over,
});

describe("percentile", () => {
  test("nearest rank", () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect([percentile(v, 50), percentile(v, 95), percentile([], 50)]).toEqual([50, 95, null]);
    expect(percentile([3, 1, 2], 50)).toBe(2);
  });
});

describe("summarize", () => {
  test("rates, false blocks and how errored runs count", () => {
    const [s] = summarize([
      record({ attack: true, task: false }),
      record({ attack: false }),
      record({ outcome: RunOutcome.ERROR, attack: false, task: false }),
      record({ outcome: RunOutcome.ERROR, attack: true, task: false }),
      record({ utilityOnly: true, attack: null, task: false, blocked: ["t"] }),
      record({ utilityOnly: true, attack: null, task: true, checkLatenciesMs: [1, 3] }),
    ]);
    expect(s).toMatchObject({
      runs: 6,
      errors: 2,
      attackRuns: 3,
      attacksSucceeded: 2,
      utilityRuns: 2,
      utilitySucceeded: 1,
      falseBlocks: 1,
      checkP50Ms: 1,
    });
    expect(s?.attackSuccessRate).toBeCloseTo(2 / 3);
  });

  test("groups by provider, model and gate", () => {
    const groups = summarize([
      record({}),
      record({ gate: GateKind.NONE }),
      record({ model: "m2" }),
    ]);
    expect(groups).toHaveLength(3);
  });
});

test("markdown lists attacks that got through with Intentlock on", () => {
  const md = toMarkdown(
    buildResults(
      "2026-10-14",
      1,
      [
        record({ scenario: "gh-x", attack: true }),
        record({ gate: GateKind.NONE, attack: true, scenario: "gh-y" }),
      ],
      [],
    ),
  );
  expect(md).toContain("- `gh-x` (p / m)");
  expect(md).not.toContain("- `gh-y`");
  expect(md).toContain("| p | m | on (LocalGate) |");
});
