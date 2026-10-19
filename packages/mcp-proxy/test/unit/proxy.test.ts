import { HoldStatus } from "@intentlock/sdk";
import { describe, expect, test } from "vitest";

import { REPO, setup } from "../fixtures/harness.js";

describe("tools/list", () => {
  test("shows only the upstream tools named in the plan", async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "add_comment",
      "flaky",
      "list_issues",
      "merge_pr",
    ]);
  });
});

describe("tools/call", () => {
  test("forwards an allowed call and reports it", async () => {
    const { call, upstreamCalls, gate } = await setup();
    expect(await call("list_issues")).toEqual({ isError: false, text: "list_issues ok" });
    expect(upstreamCalls).toEqual([{ name: "list_issues", args: { repo: REPO } }]);
    expect(gate.reports).toEqual([{ callId: expect.any(String), outcome: "ok" }]);
    expect(gate.signs).toBe(1);
  });

  test("blocks a tool that is not in the plan without calling upstream", async () => {
    const { call, upstreamCalls } = await setup();
    const result = await call("delete_repo");
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^Blocked by Intentlock \(not_in_plan\)/);
    expect(upstreamCalls).toEqual([]);
  });

  test("blocks a planned tool with arguments outside the plan", async () => {
    const { call, upstreamCalls } = await setup();
    const result = await call("list_issues", { repo: "evil/other" });
    expect(result.text).toMatch(/\(not_in_plan\)/);
    expect(upstreamCalls).toEqual([]);
  });

  test("blocks a call the policy forbids, with the rule id and reason", async () => {
    const { call, upstreamCalls } = await setup();
    const result = await call("add_comment", { repo: REPO, body: "see https://evil.test" });
    expect(result.text).toMatch(/\(no-links\): Comments never contain links/);
    expect(upstreamCalls).toEqual([]);
  });

  test("passes an upstream error through and reports it as an error", async () => {
    const { call, gate } = await setup();
    expect(await call("flaky", {})).toEqual({ isError: true, text: "rate limited" });
    expect(gate.reports.map((r) => r.outcome)).toEqual(["error"]);
  });

  test("blocks when the gate cannot be reached", async () => {
    const { call, gate, upstreamCalls } = await setup();
    gate.checkFails = true;
    const result = await call("list_issues");
    expect(result.text).toMatch(/\(server_unavailable\)/);
    expect(upstreamCalls).toEqual([]);
  });
});

describe("holds", () => {
  test("a held call runs once, only after approval, when the same call is made again", async () => {
    const { call, gate, upstreamCalls } = await setup();
    const args = { repo: REPO, pr: 12 };

    const first = await call("merge_pr", args);
    expect(first.isError).toBe(true);
    expect(first.text).toMatch(/^Held by Intentlock \(hold hold_1\)/);

    expect((await call("merge_pr", args)).text).toMatch(/hold hold_1/);
    expect(gate.holds.size).toBe(1);
    expect(upstreamCalls).toEqual([]);

    gate.holds.set("hold_1", HoldStatus.APPROVED);
    expect(await call("merge_pr", args)).toEqual({ isError: false, text: "merge_pr ok" });
    expect(upstreamCalls).toEqual([{ name: "merge_pr", args }]);
    expect(gate.reports).toHaveLength(1);

    expect((await call("merge_pr", args)).text).toMatch(/hold hold_2/);
    expect(upstreamCalls).toHaveLength(1);
  });

  test("an approval never runs a call with different arguments", async () => {
    const { call, gate, upstreamCalls } = await setup();
    await call("merge_pr", { repo: REPO, pr: 1 });
    gate.holds.set("hold_1", HoldStatus.APPROVED);
    expect((await call("merge_pr", { repo: REPO, pr: 2 })).text).toMatch(/hold hold_2/);
    expect(upstreamCalls).toEqual([]);
  });

  test("a rejected hold blocks the call", async () => {
    const { call, gate, upstreamCalls } = await setup();
    await call("merge_pr", { repo: REPO, pr: 3 });
    gate.holds.set("hold_1", HoldStatus.REJECTED);
    const result = await call("merge_pr", { repo: REPO, pr: 3 });
    expect(result.text).toMatch(/\(hold_rejected\)/);
    expect(upstreamCalls).toEqual([]);
  });

  test("an expired hold is checked again as a new call", async () => {
    const { call, advance } = await setup();
    await call("merge_pr", { repo: REPO, pr: 4 });
    advance(601_000);
    expect((await call("merge_pr", { repo: REPO, pr: 4 })).text).toMatch(/hold hold_2/);
  });
});

describe("long sessions", () => {
  test("refreshes an expired token and keeps the same plan", async () => {
    const { call, gate, advance } = await setup();
    await call("list_issues");
    advance(120_000);
    expect(await call("list_issues")).toEqual({ isError: false, text: "list_issues ok" });
    expect(gate.signs).toBe(1);
  });

  test("signs the plan file again when the token can no longer be refreshed", async () => {
    const { call, gate, advance, logs } = await setup();
    await call("list_issues");
    advance(120_000);
    gate.refreshFails = true;
    expect(await call("list_issues")).toEqual({ isError: false, text: "list_issues ok" });
    expect(gate.signs).toBe(2);
    expect(logs.some((l) => l.includes("signing the plan file again"))).toBe(true);
  });
});
