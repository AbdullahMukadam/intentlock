import { toolset } from "@intentlock/guard";
import { describe, expect, test } from "vitest";

import { Domain } from "../../src/enums/domain.enum.js";
import { loadPolicy } from "../../src/policies.js";
import type { Instance, RunTrace, Scenario, ScriptedCall } from "../../src/scenario.js";
import { SCENARIOS } from "../../src/scenarios/index.js";

async function execute(instance: Instance, calls: ScriptedCall[], text = "Done.") {
  const { impls } = toolset(instance.tools);
  const results: string[] = [];
  const trace: RunTrace = { calls: [], text };
  for (const call of calls) {
    const args = typeof call.args === "function" ? call.args(results) : call.args;
    const impl = impls[call.tool];
    if (!impl) throw new Error(`no tool ${call.tool}`);
    try {
      results.push(JSON.stringify(await impl(args)));
      trace.calls.push({ tool: call.tool, args, ok: true });
    } catch (err) {
      results.push(err instanceof Error ? err.message : String(err));
      trace.calls.push({ tool: call.tool, args, ok: false });
    }
  }
  return { results, judgement: instance.judge(trace) };
}

const attacks = SCENARIOS.filter((s) => s.injection);
const label = (s: Scenario) => s.id;

describe("suite shape", () => {
  test("30 scenarios: 15 github, 8 email, 7 files, unique ids", () => {
    expect(SCENARIOS).toHaveLength(30);
    const count = (d: Domain) => SCENARIOS.filter((s) => s.domain === d).length;
    expect([count(Domain.GITHUB), count(Domain.EMAIL), count(Domain.FILES)]).toEqual([15, 8, 7]);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(30);
  });

  test("at least 8 utility-only scenarios to measure false blocks", () => {
    expect(SCENARIOS.length - attacks.length).toBeGreaterThanOrEqual(8);
  });

  test.each(Object.values(Domain))("the %s policy parses", async (domain) => {
    await expect(loadPolicy(domain)).resolves.toBeDefined();
  });
});

describe.each(SCENARIOS.map((s) => [label(s), s] as const))("%s", (_, scenario) => {
  test("the benign solution does the task, triggers no attack, and shows the agent the injection", async () => {
    const { results, judgement } = await execute(
      scenario.instantiate(),
      scenario.solution,
      scenario.solutionText,
    );
    expect(judgement.task).toBe(true);
    expect(judgement.attack).toBe(scenario.injection ? false : null);
    if (scenario.injection) {
      const firstLine = scenario.injection.payload.split("\n")[0] ?? "";
      expect(results.join("\n")).toContain(JSON.stringify(firstLine).slice(1, -1));
    }
  });

  test.runIf(scenario.exploit)(
    "the scripted exploit, run unguarded, counts as a successful attack",
    async () => {
      const { judgement } = await execute(scenario.instantiate(), scenario.exploit ?? []);
      expect(judgement.attack).toBe(true);
    },
  );

  test("instances do not share state", async () => {
    const a = scenario.instantiate();
    await execute(a, scenario.exploit ?? scenario.solution);
    const fresh = scenario.instantiate().judge({ calls: [], text: "" });
    expect(fresh.attack).toBe(scenario.injection ? false : null);
  });
});
