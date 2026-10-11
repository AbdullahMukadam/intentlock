import { Injectable } from "@nestjs/common";
import { GENESIS, hashEntry, type AuditEntry, type AuditEntryBody } from "@intentlock/core";

import type { AuditEntry as AuditEntryRow, Prisma } from "../generated/prisma/client.js";
import { orgDb, type OrgTx } from "../org/org-db.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Arbitrary constant: the one global chain's advisory lock id (DEPLOYMENT §5.4).
const CHAIN_LOCK_ID = 7_406_211;

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

/** A database row in the exact shape core hashes (ADR-030 point 9). */
export function toAuditEntry(row: AuditEntryRow): AuditEntry {
  return {
    ...row,
    origin: row.origin as AuditEntry["origin"],
    at: row.at.toISOString(),
    clientAt: row.clientAt?.toISOString() ?? null,
    payload: row.payload as AuditEntry["payload"],
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends entries to the chain in order. Pass `tx` to make the entries atomic with other writes
   * (e.g. a hold state change); the advisory lock is then held until that transaction commits.
   */
  async append(
    orgId: string,
    entries: AuditInput[],
    tx?: OrgTx,
  ): Promise<{ seq: number; hash: string }[]> {
    if (tx) return this.appendIn(tx, orgId, entries);
    return orgDb(this.prisma, orgId).$transaction((t) => this.appendIn(t, orgId, entries));
  }

  private async appendIn(tx: OrgTx, orgId: string, entries: AuditInput[]) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_ID})`;
    // Raw SQL on purpose: the chain is global, so its head must not be filtered by org.
    const [head] = await tx.$queryRaw<{ seq: number; hash: string }[]>`
      SELECT seq, hash FROM "AuditEntry" ORDER BY seq DESC LIMIT 1`;
    let seq = head?.seq ?? 0;
    let prevHash = head?.hash ?? GENESIS;
    const out: { seq: number; hash: string }[] = [];
    for (const e of entries) {
      seq += 1;
      const at = new Date();
      const body: AuditEntryBody = {
        seq,
        orgId,
        at: at.toISOString(),
        kind: e.kind,
        origin: e.origin ?? "server",
        actor: e.actor ?? null,
        user: e.user ?? null,
        planId: e.planId ?? null,
        agentId: e.agentId ?? null,
        tool: e.tool ?? null,
        verdict: e.verdict ?? null,
        ruleId: e.ruleId ?? null,
        policyVersion: e.policyVersion ?? null,
        clientSeq: e.clientSeq ?? null,
        clientAt: e.clientAt?.toISOString() ?? null,
        clientHash: e.clientHash ?? null,
        flagged: e.flagged ?? null,
        payload: (e.payload ?? {}) as AuditEntryBody["payload"],
        prevHash,
      };
      const hash = await hashEntry(body);
      await tx.auditEntry.create({
        data: { ...body, at, clientAt: e.clientAt ?? null, payload: e.payload ?? {}, hash },
      });
      out.push({ seq, hash });
      prevHash = hash;
    }
    return out;
  }
}
