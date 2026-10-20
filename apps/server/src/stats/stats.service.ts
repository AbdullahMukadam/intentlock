import { BadRequestException, HttpStatus, Injectable } from "@nestjs/common";

import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { AuditOrigin } from "../audit/enums/audit-origin.enum.js";
import { AuditVerdict } from "../audit/enums/audit-verdict.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { emptyVerdictCounts } from "../common/utils/verdict-counts.util.js";
import { HoldStatus, Prisma } from "../generated/prisma/client.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import {
  DEFAULT_RANGE_MS,
  HOURLY_BUCKETS_UP_TO_MS,
  MAX_RANGE_MS,
  TOP_BLOCKED,
} from "./constants/stats.constants.js";
import type { OverviewQueryDto } from "./dto/overview-query.dto.js";
import { StatsBucket } from "./enums/stats-bucket.enum.js";
import { StatsError } from "./enums/stats-error.enum.js";

type BucketRow = { bucket: Date; verdict: string | null; count: number };
type TopRow = { key: string; count: number };

// ARCHITECTURE §5.10: plain SQL aggregates over indexed columns; orgId (and member scope) filtered by hand.
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(viewer: SessionUser, q: OverviewQueryDto) {
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - DEFAULT_RANGE_MS);
    const span = to.getTime() - from.getTime();
    if (span <= 0 || span > MAX_RANGE_MS) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: StatsError.INVALID_RANGE,
      });
    }
    const bucket = span <= HOURLY_BUCKETS_UP_TO_MS ? StatsBucket.HOUR : StatsBucket.DAY;
    const member = viewer.role === UserRole.MEMBER ? viewer.email : null;

    const scope = [
      Prisma.sql`"orgId" = ${viewer.orgId}`,
      Prisma.sql`at >= ${from}`,
      Prisma.sql`at < ${to}`,
      ...(q.agentId ? [Prisma.sql`"agentId" = ${q.agentId}`] : []),
      ...(member ? [Prisma.sql`"user" = ${member}`] : []),
    ];
    const entries = Prisma.join(scope, " AND ");
    const checks = Prisma.join([...scope, Prisma.sql`kind = ${AuditKind.CHECK}`], " AND ");
    const blocks = Prisma.join(
      [
        ...scope,
        Prisma.sql`kind = ${AuditKind.CHECK}`,
        Prisma.sql`verdict = ${AuditVerdict.BLOCK}`,
      ],
      " AND ",
    );
    const holdScope = Prisma.join(
      [
        Prisma.sql`"orgId" = ${viewer.orgId}`,
        Prisma.sql`status = ${HoldStatus.APPROVED}::"HoldStatus"`,
        Prisma.sql`"resolvedAt" >= ${from}`,
        Prisma.sql`"resolvedAt" < ${to}`,
        ...(q.agentId ? [Prisma.sql`"agentId" = ${q.agentId}`] : []),
        ...(member ? [Prisma.sql`"user" = ${member}`] : []),
      ],
      " AND ",
    );

    const [series, tools, rules, flagged, lag, median, pendingHolds, outcomes] = await Promise.all([
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT date_trunc(${bucket}, at) AS bucket, verdict, count(*)::int AS count
        FROM "AuditEntry" WHERE ${checks} GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.$queryRaw<TopRow[]>`
        SELECT tool AS key, count(*)::int AS count FROM "AuditEntry"
        WHERE ${blocks} AND tool IS NOT NULL GROUP BY tool ORDER BY count DESC, key LIMIT ${TOP_BLOCKED}`,
      this.prisma.$queryRaw<TopRow[]>`
        SELECT "ruleId" AS key, count(*)::int AS count FROM "AuditEntry"
        WHERE ${blocks} AND "ruleId" IS NOT NULL GROUP BY "ruleId" ORDER BY count DESC, key LIMIT ${TOP_BLOCKED}`,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "AuditEntry" WHERE ${entries} AND flagged IS NOT NULL`,
      this.prisma.$queryRaw<{ avg: number | null; max: number | null }[]>`
        SELECT avg(extract(epoch FROM at - "clientAt"))::float AS avg,
               max(extract(epoch FROM at - "clientAt"))::float AS max
        FROM "AuditEntry" WHERE ${entries} AND origin = ${AuditOrigin.CLIENT} AND "clientAt" IS NOT NULL`,
      this.prisma.$queryRaw<{ median: number | null }[]>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM "resolvedAt" - "createdAt"))::float AS median
        FROM "Hold" WHERE ${holdScope}`,
      orgDb(this.prisma, viewer.orgId).hold.count({
        where: {
          status: HoldStatus.PENDING,
          ...(q.agentId && { agentId: q.agentId }),
          ...(member && { user: member }),
        },
      }),
      orgDb(this.prisma, viewer.orgId).hold.groupBy({
        by: ["status"],
        where: {
          status: { not: HoldStatus.PENDING },
          resolvedAt: { gte: from, lt: to },
          ...(q.agentId && { agentId: q.agentId }),
          ...(member && { user: member }),
        },
        _count: { _all: true },
      }),
    ]);
    const outcome = (status: HoldStatus) =>
      outcomes.find((o) => o.status === status)?._count._all ?? 0;

    const buckets = new Map<string, ReturnType<typeof emptyVerdictCounts>>();
    const totals = emptyVerdictCounts();
    for (const row of series) {
      const key = row.bucket.toISOString();
      const c = buckets.get(key) ?? emptyVerdictCounts();
      for (const counts of [c, totals]) {
        if (row.verdict === AuditVerdict.ALLOW) counts.allow += row.count;
        if (row.verdict === AuditVerdict.BLOCK) counts.block += row.count;
        if (row.verdict === AuditVerdict.HOLD) counts.hold += row.count;
      }
      buckets.set(key, c);
    }
    const lagRow = lag[0];
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bucket,
      series: [...buckets].map(([at, c]) => ({ bucket: at, ...c })),
      totals,
      pendingHolds,
      holdOutcomes: {
        approved: outcome(HoldStatus.APPROVED),
        rejected: outcome(HoldStatus.REJECTED),
        expired: outcome(HoldStatus.EXPIRED),
      },
      medianApprovalSeconds: median[0]?.median ?? null,
      topBlockedTools: tools.map((r) => ({ tool: r.key, count: r.count })),
      topBlockedRules: rules.map((r) => ({ ruleId: r.key, count: r.count })),
      flagged: flagged[0]?.count ?? 0,
      auditLag: lagRow?.avg == null ? null : { avgSeconds: lagRow.avg, maxSeconds: lagRow.max },
    };
  }
}
