import type { Prisma } from "../../generated/prisma/client.js";

/** One entry to append; seq, at, prevHash and hash are filled in by AuditService. */
export type AuditInput = {
  kind: string;
  origin?: "server" | "client";
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
