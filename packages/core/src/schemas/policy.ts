import { z } from "zod";

import { ArgCondition } from "./plan.js";

export const Role = z.enum(["admin", "approver", "member"]);
export type Role = z.infer<typeof Role>;

const StringOrList = z.union([z.string(), z.array(z.string()).min(1)]);

export const Match = z.strictObject({
  tool: StringOrList.optional(),
  args: z.record(z.string(), ArgCondition).optional(),
  user: z
    .strictObject({
      email: z.string().optional(),
      role: Role.optional(),
      group: z.string().optional(),
    })
    .optional(),
  inPlan: z.boolean().optional(),
});
export type Match = z.infer<typeof Match>;

export const ApproverSpec = z.strictObject({
  roles: z.array(Role).default([]),
  emails: z.array(z.email()).default([]),
  self: z.boolean().default(false),
});
export type ApproverSpec = z.infer<typeof ApproverSpec>;

const RuleBase = {
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Rule ids are kebab-case"),
  match: Match,
  except: Match.optional(),
  reason: z.string().optional(),
};

export const Rule = z.discriminatedUnion("decision", [
  z.strictObject({ ...RuleBase, decision: z.literal("allow") }),
  z.strictObject({ ...RuleBase, decision: z.literal("block") }),
  z.strictObject({
    ...RuleBase,
    decision: z.literal("hold"),
    approvers: ApproverSpec.refine((a) => a.roles.length > 0 || a.emails.length > 0 || a.self, {
      message: "A hold rule needs at least one possible approver (roles, emails or self: true)",
    }),
    timeoutSeconds: z.number().int().positive().max(86_400).default(300),
  }),
]);
export type Rule = z.infer<typeof Rule>;

export const PolicySet = z
  .strictObject({
    version: z.literal(1),
    default: z.literal("block"),
    rules: z.array(Rule),
  })
  .superRefine((policy, ctx) => {
    const seen = new Set<string>();
    policy.rules.forEach((rule, i) => {
      if (seen.has(rule.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate rule id "${rule.id}"`,
          path: ["rules", i, "id"],
        });
      }
      seen.add(rule.id);
    });
  });
export type PolicySet = z.infer<typeof PolicySet>;
