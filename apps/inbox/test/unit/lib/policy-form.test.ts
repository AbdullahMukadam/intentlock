import { parsePolicy, policyToYaml, Verdict } from "@intentlock/core";
import { describe, expect, test } from "vitest";

import { ArgOp } from "../../../src/lib/enums/arg-op.enum";
import { InPlanChoice } from "../../../src/lib/enums/in-plan-choice.enum";
import {
  argRows,
  argsFromRows,
  type FormPolicy,
  type FormRule,
  inPlanChoice,
  inPlanValue,
  moveItem,
  newRuleId,
  parseScalar,
  ruleFitsForm,
  textFromValue,
  toFormPolicy,
  toolFromList,
  toPolicyDraft,
  valueFromText,
} from "../../../src/lib/policy-form";

type Condition = NonNullable<FormRule["match"]["args"]>[string];

const typed = (op: ArgOp, text: string) => ({ [op]: valueFromText(op, text) }) as Condition;

function formPolicy(): FormPolicy {
  const rules: FormRule[] = [
    {
      id: "no-destructive",
      match: { tool: toolFromList(["github_delete_repo", "shell_exec"]) },
      decision: Verdict.BLOCK,
      reason: "Never delete",
    },
    {
      id: "only-our-repos",
      match: {
        tool: toolFromList(["github_*"]),
        args: argsFromRows([
          { name: "repo", op: ArgOp.NOT_GLOB, value: valueFromText(ArgOp.NOT_GLOB, "acme/*") },
          { name: "owner", op: ArgOp.NOT_IN, value: valueFromText(ArgOp.NOT_IN, "evil, other") },
        ]),
      },
      decision: Verdict.BLOCK,
    },
    {
      id: "hold-big-refunds",
      match: {
        tool: "refund",
        args: {
          amountUsd: typed(ArgOp.GTE, "100"),
          currency: typed(ArgOp.IN, "usd, eur"),
        },
        user: { role: "member", group: "support" },
      },
      except: { user: { email: "lead@*" } },
      decision: Verdict.HOLD,
      approvers: { roles: ["approver", "admin"], emails: ["cfo@acme.dev"], self: true },
      timeoutSeconds: 600,
    },
    {
      id: "small-refunds",
      match: {
        tool: "refund",
        args: {
          amountUsd: typed(ArgOp.LTE, "99.5"),
          note: typed(ArgOp.REGEX, "^ok"),
          dryRun: typed(ArgOp.EQ, "false"),
          count: typed(ArgOp.EQ, "3"),
          label: typed(ArgOp.EQ, "needs triage"),
          path: typed(ArgOp.GLOB, "docs/**"),
        },
      },
      decision: Verdict.ALLOW,
    },
    {
      id: "off-plan",
      match: { inPlan: inPlanValue(InPlanChoice.OFF_PLAN) },
      decision: Verdict.BLOCK,
    },
    {
      id: "allow-in-plan",
      match: { inPlan: inPlanValue(InPlanChoice.IN_PLAN) },
      decision: Verdict.ALLOW,
    },
  ];
  return { version: 1, default: Verdict.BLOCK, rules };
}

function reparse(yaml: string): FormPolicy {
  const result = parsePolicy(yaml);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return toFormPolicy(result.policy);
}

describe("form → YAML → form", () => {
  test("every rule type and argument condition survives and every rule stays editable", () => {
    const yaml = policyToYaml(toPolicyDraft(formPolicy()));
    const back = reparse(yaml);
    expect(policyToYaml(toPolicyDraft(back))).toBe(yaml);
    expect(back.rules.map((r) => r.decision)).toEqual([
      Verdict.BLOCK,
      Verdict.BLOCK,
      Verdict.HOLD,
      Verdict.ALLOW,
      Verdict.BLOCK,
      Verdict.ALLOW,
    ]);
    expect(back.rules.every(ruleFitsForm)).toBe(true);
    const small = back.rules[3]!;
    expect(argRows(small.match.args).map((r) => [r.op, r.value])).toEqual([
      [ArgOp.LTE, 99.5],
      [ArgOp.REGEX, "^ok"],
      [ArgOp.EQ, false],
      [ArgOp.EQ, 3],
      [ArgOp.EQ, "needs triage"],
      [ArgOp.GLOB, "docs/**"],
    ]);
    expect(back.rules[2]).toMatchObject({
      except: { user: { email: "lead@*" } },
      approvers: { roles: ["approver", "admin"], emails: ["cfo@acme.dev"], self: true },
      timeoutSeconds: 600,
    });
    expect(inPlanChoice(back.rules[4]!.match)).toBe(InPlanChoice.OFF_PLAN);
  });

  test("each value shows as the text that types it back", () => {
    for (const op of Object.values(ArgOp)) {
      const text =
        op === ArgOp.IN || op === ArgOp.NOT_IN
          ? "a, 2, true"
          : op === ArgOp.LTE || op === ArgOp.GTE
            ? "7"
            : "x";
      expect(textFromValue(op, valueFromText(op, text))).toBe(text);
    }
  });
});

describe("what the form can show", () => {
  const rule = (args: Record<string, unknown>): FormRule => ({
    id: "r",
    match: { args: args as FormRule["match"]["args"] },
    decision: Verdict.BLOCK,
  });

  test("plain values fit", () => {
    expect(ruleFitsForm(rule({ repo: { eq: "acme/app" }, n: { lte: 5 }, f: { eq: true } }))).toBe(
      true,
    );
  });

  test.each([
    ["an object in eq", { a: { eq: { nested: 1 } } }],
    ["a list in eq", { a: { eq: [1, 2] } }],
    ["null in eq", { a: { eq: null } }],
    ["a quoted number", { a: { eq: "5" } }],
    ["a quoted boolean", { a: { eq: "true" } }],
    ["a list item with a comma", { a: { in: ["a,b"] } }],
    ["a list item with spaces around it", { a: { in: [" a"] } }],
    ["an object in a list", { a: { notIn: [{ x: 1 }] } }],
  ])("%s does not fit (it would change on the way back)", (_name, args) => {
    expect(ruleFitsForm(rule(args))).toBe(false);
  });

  test("the except block is checked too", () => {
    expect(ruleFitsForm({ ...rule({}), except: { args: { a: { eq: "5" } } } })).toBe(false);
  });
});

describe("helpers", () => {
  test("parseScalar keeps leading zeros and words as text", () => {
    expect([
      parseScalar("12"),
      parseScalar("-1.5"),
      parseScalar("012"),
      parseScalar("yes"),
    ]).toEqual([12, -1.5, "012", "yes"]);
  });

  test("moveItem and newRuleId", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(
      newRuleId([
        { id: "rule-2", match: {}, decision: Verdict.BLOCK },
        { id: "x", match: {}, decision: Verdict.BLOCK },
      ]),
    ).toBe("rule-3");
  });
});
