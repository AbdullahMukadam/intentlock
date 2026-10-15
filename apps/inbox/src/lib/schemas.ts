import { PlanStep, Role, ToolCall, Verdict } from "@intentlock/core";
import { z } from "zod";

export const Me = z.object({ email: z.string(), role: Role, groups: z.array(z.string()) });
export type Me = z.infer<typeof Me>;

export const LoginResponse = z.object({ user: Me });

export const SetupStatus = z.object({ setupRequired: z.boolean() });
export const AuthMethods = z.object({
  password: z.boolean(),
  google: z.boolean(),
  github: z.boolean(),
  passwordReset: z.boolean(),
});
export type AuthMethods = z.infer<typeof AuthMethods>;
export const InviteInfo = z.object({
  email: z.string(),
  role: Role,
  orgName: z.string(),
  expiresAt: z.string(),
});
export type InviteInfo = z.infer<typeof InviteInfo>;

export const License = z.object({ edition: z.string(), licensee: z.string() });
export type License = z.infer<typeof License>;

export const ApiErrorBody = z.object({ error: z.string() });

const VerdictCounts = z.object({ allow: z.number(), block: z.number(), hold: z.number() });

export const AgentSummary = z.object({ id: z.string(), name: z.string() });
export type AgentSummary = z.infer<typeof AgentSummary>;
export const AgentSummaries = z.array(AgentSummary);

export const Overview = z.object({
  from: z.string(),
  to: z.string(),
  bucket: z.string(),
  series: z.array(VerdictCounts.extend({ bucket: z.string() })),
  totals: VerdictCounts,
  pendingHolds: z.number(),
  medianApprovalSeconds: z.number().nullable(),
  topBlockedTools: z.array(z.object({ tool: z.string(), count: z.number() })),
  topBlockedRules: z.array(z.object({ ruleId: z.string(), count: z.number() })),
  flagged: z.number(),
  auditLag: z.object({ avgSeconds: z.number(), maxSeconds: z.number().nullable() }).nullable(),
});
export type Overview = z.infer<typeof Overview>;

export const AuditRow = z.object({
  seq: z.number(),
  at: z.string(),
  kind: z.string(),
  origin: z.string(),
  user: z.string().nullable(),
  planId: z.string().nullable(),
  agentId: z.string().nullable(),
  tool: z.string().nullable(),
  verdict: z.string().nullable(),
  ruleId: z.string().nullable(),
  policyVersion: z.number().nullable(),
  flagged: z.string().nullable(),
});
export type AuditRow = z.infer<typeof AuditRow>;
export const AuditPage = z.object({
  entries: z.array(AuditRow),
  nextCursor: z.number().nullable(),
});

export const HoldView = z.object({
  id: z.string(),
  planId: z.string(),
  agentId: z.string(),
  args: z.record(z.string(), z.unknown()),
  callId: z.string(),
  tool: z.string(),
  user: z.string(),
  ruleId: z.string(),
  status: z.string(),
  resolvedBy: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  expiresAt: z.string(),
});
export type HoldView = z.infer<typeof HoldView>;

export const RunDetail = z.object({
  plan: z.object({
    id: z.string(),
    goal: z.string(),
    user: z.string(),
    status: z.string(),
    policyVersion: z.number(),
    planHash: z.string(),
    steps: z.array(PlanStep),
    createdAt: z.string(),
    expiresAt: z.string(),
  }),
  agent: AgentSummary.nullable(),
  decisions: z.array(
    z.object({
      seq: z.number(),
      at: z.string(),
      origin: z.string(),
      tool: z.string().nullable(),
      args: z.record(z.string(), z.unknown()).nullable(),
      callId: z.string().nullable(),
      verdict: z.string().nullable(),
      ruleId: z.string().nullable(),
      reason: z.string().nullable(),
      holdId: z.string().nullable(),
      policyVersion: z.number().nullable(),
      flagged: z.string().nullable(),
    }),
  ),
  holds: z.array(HoldView),
  reports: z.array(
    z.object({ seq: z.number(), callId: z.string().nullable(), outcome: z.string().nullable() }),
  ),
  timing: z.object({
    firstDecisionAt: z.string().nullable(),
    lastDecisionAt: z.string().nullable(),
    durationMs: z.number().nullable(),
  }),
});
export type RunDetail = z.infer<typeof RunDetail>;

export const PendingHold = HoldView.extend({
  approvers: z.object({
    roles: z.array(z.string()),
    emails: z.array(z.string()),
    self: z.boolean(),
  }),
  canApprove: z.boolean(),
});
export type PendingHold = z.infer<typeof PendingHold>;
export const PendingHolds = z.array(PendingHold);

export const AgentView = AgentSummary.extend({
  description: z.string().nullable(),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
  activeKeys: z.number(),
  policyVersion: z.number().nullable(),
  last24h: VerdictCounts,
});
export type AgentView = z.infer<typeof AgentView>;
export const AgentViews = z.array(AgentView);

export const ApiKeyView = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ApiKeyView = z.infer<typeof ApiKeyView>;
export const ApiKeyViews = z.array(ApiKeyView);
export const NewApiKey = z.object({ id: z.string(), prefix: z.string(), key: z.string() });

export const PolicyVersionSummary = z.object({
  version: z.number(),
  hash: z.string(),
  message: z.string().nullable(),
  rolledBackFrom: z.number().nullable(),
  createdAt: z.string(),
});
export type PolicyVersionSummary = z.infer<typeof PolicyVersionSummary>;
export const PolicyVersionSummaries = z.array(PolicyVersionSummary);
export const PolicyVersionView = PolicyVersionSummary.extend({ source: z.string() });
export type PolicyVersionView = z.infer<typeof PolicyVersionView>;

export const AgentPolicy = z.object({ active: PolicyVersionView });

export const SampleCalls = z.array(
  z.strictObject({
    call: ToolCall,
    user: z.strictObject({
      email: z.email(),
      role: Role,
      groups: z.array(z.string()).optional(),
    }),
    inPlan: z.boolean().optional(),
  }),
);

const Outcome = z.object({ verdict: z.enum(Verdict), ruleId: z.string().nullable() });
export const PolicyTestResult = z.object({
  results: z.array(z.object({ call: ToolCall, from: Outcome, to: Outcome })),
  changed: z.array(z.object({ from: z.enum(Verdict), to: z.enum(Verdict), count: z.number() })),
});
export type PolicyTestResult = z.infer<typeof PolicyTestResult>;

export const PolicyErrors = z.object({
  errors: z.array(
    z.object({ line: z.number(), col: z.number(), path: z.string(), message: z.string() }),
  ),
});
export const StaleBaseVersion = z.object({ activeVersion: z.number().nullable() });

export const AuditVerifyResult = z.object({
  ok: z.boolean(),
  count: z.number(),
  firstBrokenSeq: z.number().optional(),
  flagged: z.array(z.object({ seq: z.number(), flagged: z.string() })),
});
export type AuditVerifyResult = z.infer<typeof AuditVerifyResult>;
