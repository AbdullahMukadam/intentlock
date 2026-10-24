import { type GateDecision, type GatePlanState, type HoldInfo, HoldStatus } from "@intentlock/core";
import type { Gate } from "@intentlock/sdk";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { CheckpointError } from "../../../src/guard/checkpoint.js";
import { createGuard } from "../../../src/guard/create-guard.js";
import { EventType } from "../../../src/guard/enums/event-type.enum.js";
import { HoldMode } from "../../../src/guard/enums/hold-mode.enum.js";
import { PlanSource } from "../../../src/guard/enums/plan-source.enum.js";
import { RunStatus } from "../../../src/guard/enums/run-status.enum.js";
import type { GuardEvent } from "../../../src/guard/events.js";
import { MessageRole } from "../../../src/provider/enums/message-role.enum.js";
import { FakeProvider, type FakeStep } from "../../../src/provider/fake.js";
import type { ChatResponse, ToolCallReq } from "../../../src/provider/types.js";
import { defineTool, toolset } from "../../../src/tools/define-tool.js";

const USER = "alice@acme-demo.dev";
const REPO = "acme-demo/public-app";
const INPUT = {
  user: USER,
  task: "Label and list",
  steps: [{ tool: "add_label" }, { tool: "list_issues" }],
};
const GATE_STATE: GatePlanState = {
  chain: { clientSeq: 3, localHash: "abc" },
  usage: [1],
  required: [],
  ran: [],
  steps: [["l", 0]],
  decisions: 2,
};

const call = (id: string, name: string, repo = REPO): ToolCallReq => ({
  id,
  name,
  args: { repo },
});
const turn = (...toolCalls: ToolCallReq[]): ChatResponse => ({ toolCalls });
const done = (text = "Done."): ChatResponse => ({ text, toolCalls: [] });
const HOLD = {
  verdict: "hold",
  ruleId: "hold-labels",
  planStep: 0,
  approvers: { roles: ["approver"] },
  timeoutSeconds: 60,
  holdId: "h1",
} as GateDecision;
const ALLOW = { verdict: "allow", ruleId: "r", planStep: 1 } as GateDecision;

function fakeGate(holds: Map<string, HoldInfo>) {
  return {
    signPlan: vi.fn(async () => ({
      planId: "plan-1",
      token: "t1",
      planHash: "h",
      policyVersion: 1,
      policyHash: "p",
      expiresAt: new Date().toISOString(),
    })),
    refresh: vi.fn(async () => ({ token: "t2", expiresAt: new Date().toISOString() })),
    check: vi.fn(async (_token: string, c: { tool: string }) =>
      c.tool === "add_label" ? HOLD : ALLOW,
    ),
    waitForHold: vi.fn(async () => "approved" as const),
    report: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    holdInfo: vi.fn(async (id: string) => {
      const info = holds.get(id);
      if (!info) throw new Error(`no hold ${id}`);
      return info;
    }),
    exportPlan: vi.fn(async () => GATE_STATE),
    importPlan: vi.fn(async () => {}),
  } satisfies Gate;
}

function setup(script: FakeStep[], gate: Gate) {
  const ran: string[] = [];
  const events: GuardEvent[] = [];
  const { tools, impls } = toolset(
    ["add_label", "list_issues"].map((name) =>
      defineTool({
        name,
        description: name,
        schema: z.object({ repo: z.string() }),
        impl: async (args) => {
          ran.push(name);
          return { ok: name, repo: args.repo };
        },
      }),
    ),
  );
  const guard = createGuard({
    provider: new FakeProvider(script),
    gate,
    tools,
    impls,
    planSource: PlanSource.EXPLICIT,
    onHold: HoldMode.SUSPEND,
    onEvent: (e) => events.push(e),
  });
  return { guard, ran, events };
}

const heldInfo = (status: HoldStatus, repo = REPO): HoldInfo => ({
  status,
  planId: "plan-1",
  callId: "h",
  tool: "add_label",
  args: { repo },
});

async function suspendedRun(status: HoldStatus) {
  const holds = new Map([["h1", heldInfo(status)]]);
  const first = setup([turn(call("h", "add_label"), call("l", "list_issues"))], fakeGate(holds));
  const paused = await first.guard.run(INPUT);
  return { holds, first, paused, stored: JSON.parse(JSON.stringify(paused.checkpoint)) as unknown };
}

describe("suspend on hold", () => {
  test("run returns a checkpoint without waiting; the other call in the turn still runs", async () => {
    const { first, paused } = await suspendedRun(HoldStatus.PENDING);
    expect(paused).toMatchObject({ status: RunStatus.SUSPENDED, holdIds: ["h1"], turns: 1 });
    expect(first.ran).toEqual(["list_issues"]);
    expect(paused.checkpoint).toMatchObject({
      planId: "plan-1",
      token: "t1",
      held: [{ index: 0, holdId: "h1", ruleId: "hold-labels" }],
      gate: GATE_STATE,
    });
    expect(paused.checkpoint!.results[0]).toBeNull();
    expect(paused.checkpoint!.results[1]).toMatchObject({ callId: "l", isError: false });
  });

  test("approved: a fresh guard and gate (process restart) run the held call once and continue", async () => {
    const { holds, stored } = await suspendedRun(HoldStatus.APPROVED);
    const gate = fakeGate(holds);
    const second = setup([done("Labelled.")], gate);
    const result = await second.guard.resume(stored);
    expect(result).toMatchObject({ status: RunStatus.COMPLETED, text: "Labelled.", turns: 2 });
    expect(second.ran).toEqual(["add_label"]);
    expect(gate.importPlan).toHaveBeenCalledWith("plan-1", GATE_STATE);
    expect(gate.refresh).toHaveBeenCalledWith("plan-1", "t1");
    expect(gate.report).toHaveBeenCalledWith("t2", "h", "ok");
    const tool = result.messages.find((m) => m.role === MessageRole.TOOL);
    expect(tool).toMatchObject({ results: [{ callId: "h", isError: false }, { callId: "l" }] });
    expect(second.events.map((e) => e.type)).toEqual([EventType.APPROVED]);
  });

  test.each([
    [HoldStatus.REJECTED, EventType.REJECTED, /rejected this action/],
    [HoldStatus.EXPIRED, EventType.TIMEOUT, /no approval arrived/],
  ])("%s: the call never runs and the model is told", async (status, event, content) => {
    const { holds, stored } = await suspendedRun(status);
    const second = setup([done()], fakeGate(holds));
    const result = await second.guard.resume(stored);
    expect(second.ran).toEqual([]);
    expect(second.events.map((e) => e.type)).toEqual([event]);
    const tool = result.messages.find((m) => m.role === MessageRole.TOOL);
    expect(tool && "results" in tool && tool.results[0]!.content).toMatch(content);
  });

  test("still pending: resume returns the same checkpoint and runs nothing", async () => {
    const { holds, stored } = await suspendedRun(HoldStatus.PENDING);
    const gate = fakeGate(holds);
    const second = setup([], gate);
    const result = await second.guard.resume(stored);
    expect(result).toMatchObject({ status: RunStatus.SUSPENDED, holdIds: ["h1"] });
    expect(second.ran).toEqual([]);
    expect(gate.refresh).not.toHaveBeenCalled();
  });

  test("tampered checkpoint (different arguments than the hold) is refused and nothing runs", async () => {
    const { holds, stored } = await suspendedRun(HoldStatus.APPROVED);
    const edited = JSON.parse(JSON.stringify(stored)) as {
      messages: { toolCalls?: ToolCallReq[] }[];
    };
    edited.messages.at(-1)!.toolCalls![0]!.args = { repo: "acme-demo/private-app" };
    const second = setup([done()], fakeGate(holds));
    await expect(second.guard.resume(edited)).rejects.toThrow(CheckpointError);
    expect(second.ran).toEqual([]);
  });

  test("a hold from another plan or call is refused", async () => {
    const { stored } = await suspendedRun(HoldStatus.APPROVED);
    const other = new Map([["h1", { ...heldInfo(HoldStatus.APPROVED), planId: "plan-2" }]]);
    const second = setup([done()], fakeGate(other));
    await expect(second.guard.resume(stored)).rejects.toThrow(/does not match hold h1/);
    expect(second.ran).toEqual([]);
  });

  test("malformed checkpoints are refused", async () => {
    const second = setup([], fakeGate(new Map()));
    await expect(second.guard.resume({ version: 1 })).rejects.toThrow(CheckpointError);
  });

  test("suspend needs a gate that can look up holds", () => {
    const { holdInfo: _drop, ...gate } = fakeGate(new Map());
    expect(() => setup([], gate)).toThrow(/look up holds/);
  });
});

describe("token refresh on resume", () => {
  const jwt = (exp: number) =>
    `e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;
  const secondsFromNow = (s: number) => Math.floor(Date.now() / 1000) + s;

  async function resumeWithToken(token: string, refreshFails = false) {
    const { holds, stored } = await suspendedRun(HoldStatus.APPROVED);
    const gate = fakeGate(holds);
    if (refreshFails) gate.refresh.mockRejectedValue(new Error("409 (plan_not_active)"));
    const second = setup([done()], gate);
    const result = await second.guard.resume({ ...(stored as object), token });
    return { gate, second, result };
  }

  test("a token that is still valid is used as it is: no refresh, no error event", async () => {
    const token = jwt(secondsFromNow(600));
    const { gate, second, result } = await resumeWithToken(token, true);
    expect(result.status).toBe(RunStatus.COMPLETED);
    expect(gate.refresh).not.toHaveBeenCalled();
    expect(gate.report).toHaveBeenCalledWith(token, "h", "ok");
    expect(second.events.map((e) => e.type)).toEqual([EventType.APPROVED]);
  });

  test.each([
    ["expired", -60],
    ["about to expire", 30],
  ])("an %s token is refreshed before the held call runs", async (_name, offset) => {
    const { gate } = await resumeWithToken(jwt(secondsFromNow(offset)));
    expect(gate.refresh).toHaveBeenCalledWith("plan-1", expect.any(String));
    expect(gate.report).toHaveBeenCalledWith("t2", "h", "ok");
  });

  test("a failed refresh of an expired token is reported and the approved call still runs", async () => {
    const { second } = await resumeWithToken(jwt(secondsFromNow(-60)), true);
    expect(second.ran).toEqual(["add_label"]);
    expect(second.events[0]).toMatchObject({
      type: EventType.ERROR,
      reason: "token refresh failed: 409 (plan_not_active)",
    });
  });
});
