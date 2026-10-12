import type { Prisma } from "../../generated/prisma/client.js";
import type { AuditKind } from "../enums/audit-kind.enum.js";
import type { AuditOrigin } from "../enums/audit-origin.enum.js";

export type AuditInput = {
  kind: AuditKind;
  origin?: AuditOrigin;
  actor?: string | null;
  user?: string | null;
  planId?: string | null;
  agentId?: string | null;
  tool?: string | null;
  verdict?: string | null;
  ruleId?: string | null;
  policyVersion?: number | null;
  clientSeq?: number | null;
  clientAt?: Date | null;
  clientHash?: string | null;
  flagged?: string | null;
  payload?: Prisma.InputJsonValue;
};
