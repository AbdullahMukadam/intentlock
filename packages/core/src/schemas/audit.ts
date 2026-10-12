import { z } from "zod";

import { ClientEntryKind } from "../enums/client-entry-kind.enum.js";
import { ReportOutcome } from "../enums/report-outcome.enum.js";
import { GateDecision } from "./decision.js";
import { ToolCall } from "./tool-call.js";

// Every field except `hash` is hashed (ARCHITECTURE §5.4), so the chain covers exactly this schema.
export const AuditEntryBody = z.strictObject({
  seq: z.number().int().positive(),
  orgId: z.string(),
  at: z.iso.datetime(),
  kind: z.string(),
  origin: z.enum(["server", "client"]),
  actor: z.string().nullable(),
  user: z.string().nullable(),
  planId: z.string().nullable(),
  agentId: z.string().nullable(),
  tool: z.string().nullable(),
  verdict: z.string().nullable(),
  ruleId: z.string().nullable(),
  policyVersion: z.number().int().nullable(),
  clientSeq: z.number().int().nullable(),
  clientAt: z.iso.datetime().nullable(),
  clientHash: z.string().nullable(),
  flagged: z.string().nullable(),
  payload: z.json(),
  prevHash: z.string(),
});
export type AuditEntryBody = z.infer<typeof AuditEntryBody>;

export const AuditEntry = AuditEntryBody.extend({ hash: z.string() });
export type AuditEntry = z.infer<typeof AuditEntry>;

export const ClientEntryBody = z.strictObject({
  planId: z.string().min(1),
  clientSeq: z.number().int().positive(),
  clientAt: z.iso.datetime(),
  kind: z.enum(ClientEntryKind),
  token: z.string().min(1),
  call: ToolCall.optional(),
  decision: GateDecision.optional(),
  usage: z.array(z.number().int().nonnegative()).optional(),
  callId: z.string().optional(),
  outcome: z.enum(ReportOutcome).optional(),
  decisionCount: z.number().int().nonnegative().optional(),
  prevLocalHash: z.string(),
});
export type ClientEntryBody = z.infer<typeof ClientEntryBody>;

export const ClientEntry = ClientEntryBody.extend({ localHash: z.string() });
export type ClientEntry = z.infer<typeof ClientEntry>;
