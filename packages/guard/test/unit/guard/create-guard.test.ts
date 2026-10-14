import {
  generateSigningKeyPair,
  parsePolicy,
  type GateDecision,
  type PlanInput,
  type PolicySet,
} from "@intentlock/core";
import { type Gate, LocalGate } from "@intentlock/sdk";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { MessageRole } from "../../../src/provider/enums/message-role.enum.js";
import { FakeProvider, type FakeStep } from "../../../src/provider/fake.js";
import type { ChatResponse, ToolCallReq } from "../../../src/provider/types.js";
import { defineTool, toolset } from "../../../src/tools/define-tool.js";
import { createGuard } from "../../../src/guard/create-guard.js";
import { EventType } from "../../../src/guard/enums/event-type.enum.js";
import { PlanSource } from "../../../src/guard/enums/plan-source.enum.js";
import { RunStatus } from "../../../src/guard/enums/run-status.enum.js";
import type { GuardEvent } from "../../../src/guard/events.js";
import { PlannerError } from "../../../src/guard/planner.js";

const USER = "alice@acme-demo.dev";
const REPO = "acme-demo/public-app";

function policy(): PolicySet {
  const result = parsePolicy(`version: 1
default: block
rules:
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.policy;
}

let privateKey: CryptoKey;
beforeAll(async () => {
  privateKey = (await generateSigningKeyPair()).privateKey;
});

const localGate = () => new LocalGate({ privateKey, policies: policy() });

const repoArgs = z.object({ repo: z.string() });

function makeTools() {
  const ran: string[] = [];
  const tool = (name: string, impl?: () => Promise<unknown>) =>
    defineTool({
      name,
      description: `${name} on a repo`,
      schema: repoArgs,
      impl: async (args) => {
        ran.push(name);
        return impl ? impl() : { ok: name, repo: args.repo };
      },
    });
  return {
    ran,
    ...toolset([
      tool("list_issues"),
      tool("add_label"),
      tool("delete_repo"),
      tool("explode", async () => {
        throw new Error("kaboom");
      }),
    ]),
  };
}

const call = (
  id: string,
  name: string,
  args: Record<string, unknown> = { repo: REPO },
): ToolCallReq => ({ id, name, args });
const turn = (...toolCalls: ToolCallReq[]): ChatResponse => ({ toolCalls });
const done = (text = "Done."): ChatResponse => ({ text, toolCalls: [] });
const declare = (steps: unknown[], goal = "Triage issues"): ChatResponse =>
  turn({ id: "p1", name: "declare_plan", args: { goal, steps } });
const PLAN_STEPS = [
  { tool: "list_issues", args: { repo: { eq: REPO } } },
  { tool: "add_label", args: { repo: { eq: REPO } }, required: true },
  { tool: "explode" },
];

function setup(script: FakeStep[], gate: Gate = localGate(), extra: Record<string, unknown> = {}) {
  const t = makeTools();
  const events: GuardEvent[] = [];
  const provider = new FakeProvider(script);
  const guard = createGuard({
    provider,
    gate,
    tools: t.tools,
    impls: t.impls,
    onEvent: (e) => events.push(e),
    ...extra,
  });
  return { guard, provider, events, ran: t.ran };
}

type ToolMessage = {
  role: MessageRole.TOOL;
  results: { callId: string; content: string; isError: boolean }[];
};
const toolMessages = (messages: { role: string }[]) =>
  messages.filter((m) => m.role === MessageRole.TOOL) as ToolMessage[];
const firstResults = (messages: { role: string }[]) => toolMessages(messages)[0]!.results;

describe("run with the planner", () => {
  test("allowed call runs, model finishes, events carry provider and latency", async () => {
    const { guard, provider, events, ran } = setup([
      declare(PLAN_STEPS),
      turn(call("c1", "list_issues")),
      done("Listed."),
    ]);
    const result = await guard.run({ user: USER, task: `Triage open issues in ${REPO}` });
    expect(result).toMatchObject({ status: RunStatus.COMPLETED, text: "Listed.", turns: 2 });
    expect(ran).toEqual(["list_issues"]);
    expect(firstResults(result.messages)).toEqual([
      { callId: "c1", content: JSON.stringify({ ok: "list_issues", repo: REPO }), isError: false },
    ]);
    expect(events.map((e) => e.type)).toEqual([EventType.PLAN_SIGNED, EventType.ALLOW]);
    expect(events[1]).toMatchObject({ user: USER, provider: "fake", tool: "list_issues" });
    expect(events[1]!.latencyMs).toBeTypeOf("number");

    const plannerReq = provider.requests[0]!;
    expect(plannerReq.toolChoice).toEqual({ name: "declare_plan" });
    expect(plannerReq.tools.map((t) => t.name)).toEqual(["declare_plan"]);
    expect(plannerReq.messages).toHaveLength(1);
    expect(plannerReq.system).toMatch(/Pin scope/);
  });

  test("off-plan and off-scope calls are blocked with the rule text, never run", async () => {
    const { guard, ran, events } = setup([
      declare(PLAN_STEPS),
      turn(call("c1", "delete_repo"), call("c2", "list_issues", { repo: "evil/other" })),
      done(),
    ]);
    const result = await guard.run({ user: USER, task: "Triage" });
    const [r1, r2] = firstResults(result.messages);
    expect(r1).toEqual({
      callId: "c1",
      content:
        "Blocked by Intentlock (not_in_plan): not_in_plan. This action is outside what the user asked for.",
      isError: true,
    });
    expect(r2!.isError).toBe(true);
    expect(ran).toEqual([]);
    expect(events.filter((e) => e.type === EventType.BLOCK)).toHaveLength(2);
  });

  test("parallel calls: one blocked, the others run, results in call order in one message", async () => {
    const { guard, ran } = setup([
      declare(PLAN_STEPS),
      turn(call("a", "list_issues"), call("b", "delete_repo"), call("c", "add_label")),
      done(),
    ]);
    const result = await guard.run({ user: USER, task: "Triage" });
    expect(toolMessages(result.messages)).toHaveLength(1);
    expect(firstResults(result.messages).map((r) => [r.callId, r.isError])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
    expect(ran.sort()).toEqual(["add_label", "list_issues"]);
  });

  test("unknown tool and unparseable args become error results without a check", async () => {
    const gate = localGate();
    const check = vi.spyOn(gate, "check");
    const { guard, ran } = setup(
      [
        declare(PLAN_STEPS),
        turn(call("u", "rm_rf"), {
          ...call("j", "list_issues", {}),
          argsError: "Arguments are not valid JSON",
        }),
        done(),
      ],
      gate,
    );
    const result = await guard.run({ user: USER, task: "Triage" });
    const [u, j] = firstResults(result.messages);
    expect(u!.content).toMatch(/^Blocked by Intentlock \(unknown_tool\)/);
    expect(j!.content).toMatch(
      /^Blocked by Intentlock \(invalid_args\): Arguments are not valid JSON/,
    );
    expect(check).not.toHaveBeenCalled();
    expect(ran).toEqual([]);
  });

  test("args that fail the tool schema never reach the impl", async () => {
    const { guard, ran } = setup([
      declare([{ tool: "list_issues" }]),
      turn(call("x", "list_issues", { repo: 42 })),
      done(),
    ]);
    const result = await guard.run({ user: USER, task: "Triage" });
    expect(firstResults(result.messages)[0]).toMatchObject({
      isError: true,
      content: expect.stringMatching(/^Tool failed: Invalid arguments/),
    });
    expect(ran).toEqual([]);
  });

  test("impl throws: error result and report(error)", async () => {
    const gate = localGate();
    const report = vi.spyOn(gate, "report");
    const { guard, events } = setup(
      [declare(PLAN_STEPS), turn(call("e", "explode")), done()],
      gate,
    );
    const result = await guard.run({ user: USER, task: "Triage" });
    expect(firstResults(result.messages)[0]).toEqual({
      callId: "e",
      content: "Tool failed: kaboom",
      isError: true,
    });
    expect(report).toHaveBeenCalledWith(expect.any(String), "e", "error");
    expect(events.at(-1)).toMatchObject({ type: EventType.ERROR, reason: "kaboom" });
  });

  test("stops after maxTurns", async () => {
    const again: FakeStep = () => turn(call(crypto.randomUUID(), "list_issues"));
    const { guard } = setup(
      [declare([{ tool: "list_issues", maxCalls: 50 }]), again, again, again],
      localGate(),
      { maxTurns: 3 },
    );
    const result = await guard.run({ user: USER, task: "Triage" });
    expect(result).toMatchObject({ status: RunStatus.MAX_TURNS, turns: 3 });
  });
});

describe("planner", () => {
  test("retries once after a missing declare_plan, then succeeds", async () => {
    const { guard, provider } = setup([done("no tools"), declare(PLAN_STEPS), done()]);
    await expect(guard.run({ user: USER, task: "Triage" })).resolves.toMatchObject({
      status: RunStatus.COMPLETED,
    });
    expect(provider.requests).toHaveLength(3);
  });

  const badJson: ChatResponse = turn({
    id: "p",
    name: "declare_plan",
    args: {},
    argsError: "bad",
  });
  const providerDown: FakeStep = () => {
    throw new Error("503");
  };

  test.each<[string, FakeStep[]]>([
    ["missing twice", [done(), done()]],
    ["invalid steps twice", [declare([]), declare([{ tool: "nope" }])]],
    [
      "extra calls, then a wrong type",
      [turn(call("p", "declare_plan"), call("q", "list_issues")), declare([{ tool: 3 }])],
    ],
    ["bad JSON, then provider error", [badJson, providerDown]],
  ])("fails the run closed: %s", async (_name, script) => {
    const gate = localGate();
    const sign = vi.spyOn(gate, "signPlan");
    const { guard, ran, events } = setup(script, gate);
    await expect(guard.run({ user: USER, task: "Triage" })).rejects.toBeInstanceOf(PlannerError);
    expect(sign).not.toHaveBeenCalled();
    expect(ran).toEqual([]);
    expect(events.map((e) => e.type)).toEqual([EventType.ERROR]);
  });

  test("explicit plan source skips the planner", async () => {
    const gate = localGate();
    const sign = vi.spyOn(gate, "signPlan");
    const { guard, provider } = setup([turn(call("c", "list_issues")), done()], gate, {
      planSource: PlanSource.EXPLICIT,
    });
    const steps: PlanInput["steps"] = [{ tool: "list_issues" }];
    await guard.run({ user: USER, task: "Triage", steps });
    expect(sign.mock.calls[0]![0]).toMatchObject({ user: USER, goal: "Triage", steps });
    expect(provider.requests[0]!.tools.map((t) => t.name)).not.toContain("declare_plan");
    const bare = setup([], gate, { planSource: PlanSource.EXPLICIT }).guard;
    await expect(bare.run({ user: USER, task: "x" })).rejects.toThrow(/needs steps/);
  });
});

function fakeGate(decide: (token: string) => GateDecision, over: Partial<Gate> = {}) {
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
    check: vi.fn(async (token: string) => decide(token)),
    waitForHold: vi.fn(async () => "approved" as const),
    report: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    ...over,
  } satisfies Gate;
}

const HOLD = {
  verdict: "hold",
  ruleId: "hold-labels",
  planStep: 0,
  approvers: { roles: ["approver"] },
  timeoutSeconds: 60,
  holdId: "h1",
} as GateDecision;
const ALLOW = { verdict: "allow", ruleId: "r", planStep: 0 } as GateDecision;
const EXPIRED = { verdict: "block", ruleId: null, reason: "token_expired" } as GateDecision;
const explicit = { planSource: PlanSource.EXPLICIT };
const listInput = { user: USER, task: "List", steps: [{ tool: "list_issues" }] };

describe("holds", () => {
  test.each([
    ["approved", true, EventType.APPROVED, /^\{/],
    ["rejected", false, EventType.REJECTED, /rejected this action/],
    ["expired", false, EventType.TIMEOUT, /no approval arrived/],
  ] as const)("%s", async (outcome, runs, event, content) => {
    const gate = fakeGate(() => HOLD, { waitForHold: vi.fn(async () => outcome) });
    const { guard, ran, events } = setup([turn(call("h", "add_label")), done()], gate, {
      ...explicit,
      holdTimeoutMs: 1234,
    });
    const result = await guard.run({ user: USER, task: "Label", steps: [{ tool: "add_label" }] });
    expect(gate.waitForHold).toHaveBeenCalledWith("h1", { timeoutMs: 1234 });
    expect(ran).toEqual(runs ? ["add_label"] : []);
    expect(firstResults(result.messages)[0]!.content).toMatch(content);
    expect(events.map((e) => e.type)).toEqual([EventType.PLAN_SIGNED, EventType.HOLD, event]);
  });

  test("a failing wait counts as a timeout", async () => {
    const gate = fakeGate(() => HOLD, {
      waitForHold: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    const { guard, ran, events } = setup([turn(call("h", "add_label")), done()], gate, explicit);
    await guard.run({ user: USER, task: "Label", steps: [{ tool: "add_label" }] });
    expect(ran).toEqual([]);
    expect(events.at(-1)!.type).toBe(EventType.TIMEOUT);
  });
});

describe("gate failures and token refresh", () => {
  test("check throws → block server_unavailable", async () => {
    const gate = fakeGate(() => {
      throw new Error("ECONNREFUSED");
    });
    const { guard, ran } = setup([turn(call("c", "list_issues")), done()], gate, explicit);
    const result = await guard.run(listInput);
    expect(firstResults(result.messages)[0]!.content).toMatch(
      /^Blocked by Intentlock \(server_unavailable\)/,
    );
    expect(ran).toEqual([]);
  });

  test("expired token: one refresh shared by concurrent calls, the new token sticks", async () => {
    const gate = fakeGate((token) => (token === "t1" ? EXPIRED : ALLOW));
    const { guard, ran } = setup(
      [
        turn(call("a", "list_issues"), call("b", "list_issues")),
        turn(call("c", "list_issues")),
        done(),
      ],
      gate,
      explicit,
    );
    await guard.run(listInput);
    expect(gate.refresh).toHaveBeenCalledTimes(1);
    expect(gate.refresh).toHaveBeenCalledWith("plan-1", "t1");
    expect(ran).toEqual(["list_issues", "list_issues", "list_issues"]);
    expect(gate.report).toHaveBeenLastCalledWith("t2", "c", "ok");
  });

  test.each([
    ["refresh fails", { refresh: vi.fn(async () => Promise.reject(new Error("409"))) }],
    ["still expired after refresh", {}],
  ])("%s → block", async (_name, over) => {
    const gate = fakeGate(() => EXPIRED, over);
    const { guard, ran } = setup([turn(call("a", "list_issues")), done()], gate, explicit);
    const result = await guard.run(listInput);
    expect(firstResults(result.messages)[0]!.content).toMatch(/token_expired/);
    expect(gate.refresh).toHaveBeenCalledTimes(1);
    expect(ran).toEqual([]);
  });
});

describe("options", () => {
  test("rejects missing impls, duplicates, reserved and invalid names, bad gates", () => {
    const { tools, impls } = makeTools();
    const provider = new FakeProvider();
    const gate = fakeGate(() => ALLOW);
    const one = async () => 1;
    expect(() => createGuard({ provider, gate, tools, impls: {} })).toThrow(
      /no impl for list_issues/,
    );
    expect(() => createGuard({ provider, gate, tools: [...tools, tools[0]!], impls })).toThrow(
      /duplicate/,
    );
    expect(() =>
      createGuard({
        provider,
        gate,
        tools: [{ ...tools[0]!, name: "declare_plan" }],
        impls: { declare_plan: one },
      }),
    ).toThrow(/reserved/);
    expect(() =>
      createGuard({
        provider,
        gate,
        tools: [{ ...tools[0]!, name: "a.b" }],
        impls: { "a.b": one },
      }),
    ).toThrow(/Invalid guard options/);
    expect(() => createGuard({ provider, gate: {} as Gate, tools, impls })).toThrow(
      /gate must implement/,
    );
  });

  test("defineTool emits a JSON schema without $schema", () => {
    expect(makeTools().tools[0]!.inputSchema).toEqual({
      type: "object",
      properties: { repo: { type: "string" } },
      required: ["repo"],
    });
  });
});
