import { Injectable } from "@nestjs/common";

import type { SessionUser } from "../common/types/auth.types.js";
import type { Prisma } from "../generated/prisma/client.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { AUDIT_BATCH } from "./constants/audit.constants.js";
import type { AuditFilter } from "./types/audit-filter.type.js";
import { toAuditEntry } from "./utils/to-audit-entry.util.js";

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async page(viewer: SessionUser, filter: AuditFilter, limit: number, cursor?: number) {
    const rows = await orgDb(this.prisma, viewer.orgId).auditEntry.findMany({
      where: { ...this.where(viewer, filter), ...(cursor ? { seq: { lt: cursor } } : {}) },
      orderBy: { seq: "desc" },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      entries: page.map(toAuditEntry),
      nextCursor: rows.length > limit ? (page.at(-1)?.seq ?? null) : null,
    };
  }

  async numbered(viewer: SessionUser, filter: AuditFilter, limit: number, page: number) {
    const db = orgDb(this.prisma, viewer.orgId);
    const where = this.where(viewer, filter);
    const [total, rows] = await Promise.all([
      db.auditEntry.count({ where }),
      db.auditEntry.findMany({
        where,
        orderBy: { seq: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { entries: rows.map(toAuditEntry), total, page, nextCursor: null };
  }

  async *export(viewer: SessionUser, filter: AuditFilter) {
    const db = orgDb(this.prisma, viewer.orgId);
    let after = 0;
    for (;;) {
      const rows = await db.auditEntry.findMany({
        where: { ...this.where(viewer, filter), seq: { gt: after } },
        orderBy: { seq: "asc" },
        take: AUDIT_BATCH,
      });
      for (const row of rows) yield toAuditEntry(row);
      if (rows.length < AUDIT_BATCH) return;
      after = rows.at(-1)!.seq;
    }
  }

  // Members only ever see entries for runs they own (ARCHITECTURE §5.6).
  private where(viewer: SessionUser, f: AuditFilter): Prisma.AuditEntryWhereInput {
    const user = viewer.role === UserRole.MEMBER ? viewer.email : f.user;
    const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
    return {
      ...(f.agentId && { agentId: f.agentId }),
      ...(user && { user }),
      ...(f.tool && { tool: f.tool }),
      ...(f.verdict && { verdict: f.verdict }),
      ...(f.ruleId && { ruleId: f.ruleId }),
      ...(f.policyVersion && { policyVersion: f.policyVersion }),
      ...((f.from || f.to) && {
        at: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) },
      }),
      ...(f.q && {
        OR: [
          { kind: contains(f.q) },
          { tool: contains(f.q) },
          { ruleId: contains(f.q) },
          { user: contains(f.q) },
        ],
      }),
    };
  }
}
