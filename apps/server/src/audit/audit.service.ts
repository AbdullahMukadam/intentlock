import { Injectable } from "@nestjs/common";
import { GENESIS, hashEntry, type AuditEntryBody } from "@intentlock/core";

import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditOrigin } from "./enums/audit-origin.enum.js";
import type { AuditInput } from "./types/audit-input.type.js";

// Advisory lock id of the single global audit chain (DEPLOYMENT §5.4).
const CHAIN_LOCK_ID = 7_406_211;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Pass tx to append atomically with other writes; the chain lock is held until it commits.
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
        origin: e.origin ?? AuditOrigin.SERVER,
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
