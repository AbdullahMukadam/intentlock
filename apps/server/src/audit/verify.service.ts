import { Injectable } from "@nestjs/common";
import { GENESIS, hashEntry } from "@intentlock/core";

import { PrismaService } from "../prisma/prisma.service.js";
import { AUDIT_BATCH, MAX_FLAGGED_LISTED } from "./constants/audit.constants.js";
import { toAuditEntry } from "./utils/to-audit-entry.util.js";

// Walks the single global chain in batches; deliberately unscoped because the chain spans every org.
@Injectable()
export class VerifyService {
  constructor(private readonly prisma: PrismaService) {}

  async verify() {
    let prev = GENESIS;
    let count = 0;
    let after = 0;
    const flagged: { seq: number; flagged: string }[] = [];
    for (;;) {
      const rows = await this.prisma.auditEntry.findMany({
        where: { seq: { gt: after } },
        orderBy: { seq: "asc" },
        take: AUDIT_BATCH,
      });
      for (const row of rows) {
        const { hash, ...body } = toAuditEntry(row);
        if (body.prevHash !== prev) return { ok: false, count, firstBrokenSeq: row.seq, flagged };
        if ((await hashEntry(body)) !== hash) {
          return { ok: false, count, firstBrokenSeq: row.seq, flagged };
        }
        if (row.flagged && flagged.length < MAX_FLAGGED_LISTED) {
          flagged.push({ seq: row.seq, flagged: row.flagged });
        }
        prev = hash;
        count++;
      }
      if (rows.length < AUDIT_BATCH) return { ok: true, count, flagged };
      after = rows.at(-1)!.seq;
    }
  }
}
