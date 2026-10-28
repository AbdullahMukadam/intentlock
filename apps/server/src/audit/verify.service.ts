import { Inject, Injectable } from "@nestjs/common";
import { GENESIS, hashEntry } from "@intentlock/core";

import type { SessionUser } from "../common/types/auth.types.js";
import { ENV, type Env } from "../config/config.module.js";
import { LicenseService } from "../license/license.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "./audit.service.js";
import { AUDIT_ARCHIVE, AUDIT_BATCH, MAX_FLAGGED_LISTED } from "./constants/audit.constants.js";
import { AuditKind } from "./enums/audit-kind.enum.js";
import type { AuditArchive } from "./types/audit-archive.type.js";
import { toAuditEntry } from "./utils/to-audit-entry.util.js";

type Flagged = { seq: number; flagged: string; planId: string | null };
type VerifyResult = {
  ok: boolean;
  count: number;
  fromSeq?: number;
  firstBrokenSeq?: number;
  flagged: Flagged[];
};

@Injectable()
export class VerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly license: LicenseService,
    @Inject(ENV) private readonly env: Env,
    @Inject(AUDIT_ARCHIVE) private readonly archive: AuditArchive | null,
  ) {}

  async verify(user: SessionUser): Promise<VerifyResult> {
    const result = await this.walk();
    const { ok, count, fromSeq, firstBrokenSeq } = result;
    await this.audit.append(user.orgId, [
      {
        kind: AuditKind.AUDIT_VERIFIED,
        actor: user.id,
        payload: {
          email: user.email,
          ok,
          count,
          ...(fromSeq && { fromSeq }),
          ...(firstBrokenSeq && { firstBrokenSeq }),
        },
      },
    ]);
    return result;
  }

  async summary() {
    const [count, head, oldest, last, purge] = await Promise.all([
      this.prisma.auditEntry.count(),
      this.prisma.auditEntry.findFirst({
        orderBy: { seq: "desc" },
        select: { seq: true, hash: true, at: true },
      }),
      this.prisma.auditEntry.findFirst({
        orderBy: { seq: "asc" },
        select: { seq: true, at: true },
      }),
      this.prisma.auditEntry.findFirst({
        where: { kind: AuditKind.AUDIT_VERIFIED },
        orderBy: { seq: "desc" },
        select: { seq: true, at: true, payload: true },
      }),
      this.prisma.auditEntry.findFirst({
        where: { kind: AuditKind.AUDIT_PURGED },
        orderBy: { seq: "desc" },
        select: { at: true, payload: true },
      }),
    ]);
    return {
      count,
      head: head && { ...head, at: head.at.toISOString() },
      oldest: oldest && { ...oldest, at: oldest.at.toISOString() },
      retentionDays: this.license.current().retentionDays,
      deletion: {
        afterDays: this.env.AUDIT_DELETE_AFTER_DAYS ?? null,
        target: this.archive?.target ?? null,
        lastRun: purge && {
          at: purge.at.toISOString(),
          ...(purge.payload as { toSeq: number; count: number }),
        },
      },
      lastVerified: last && {
        seq: last.seq,
        at: last.at.toISOString(),
        ...(last.payload as { email: string; ok: boolean; count: number; firstBrokenSeq?: number }),
      },
    };
  }

  private async anchorHash(firstSeq: number): Promise<unknown> {
    const anchor = await this.prisma.auditEntry.findFirst({
      where: { kind: AuditKind.AUDIT_PURGED, payload: { path: ["toSeq"], equals: firstSeq - 1 } },
      orderBy: { seq: "desc" },
      select: { payload: true },
    });
    return (anchor?.payload as { lastHash?: unknown } | undefined)?.lastHash;
  }

  private async walk(): Promise<VerifyResult> {
    let prev = GENESIS;
    let count = 0;
    let after = 0;
    const flagged: Flagged[] = [];
    const first = await this.prisma.auditEntry.findFirst({ orderBy: { seq: "asc" } });
    const fromSeq = first && first.prevHash !== GENESIS ? first.seq : undefined;
    if (first && fromSeq !== undefined) {
      if ((await this.anchorHash(fromSeq)) !== first.prevHash) {
        return { ok: false, count, fromSeq, firstBrokenSeq: fromSeq, flagged };
      }
      prev = first.prevHash;
      after = fromSeq - 1;
    }
    for (;;) {
      const rows = await this.prisma.auditEntry.findMany({
        where: { seq: { gt: after } },
        orderBy: { seq: "asc" },
        take: AUDIT_BATCH,
      });
      for (const row of rows) {
        const { hash, ...body } = toAuditEntry(row);
        if (body.prevHash !== prev) {
          return { ok: false, count, fromSeq, firstBrokenSeq: row.seq, flagged };
        }
        if ((await hashEntry(body)) !== hash) {
          return { ok: false, count, fromSeq, firstBrokenSeq: row.seq, flagged };
        }
        if (row.flagged && flagged.length < MAX_FLAGGED_LISTED) {
          flagged.push({ seq: row.seq, flagged: row.flagged, planId: row.planId });
        }
        prev = hash;
        count++;
      }
      if (rows.length < AUDIT_BATCH) return { ok: true, count, fromSeq, flagged };
      after = rows.at(-1)!.seq;
    }
  }
}
