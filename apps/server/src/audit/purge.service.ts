import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { sha256Hex } from "@intentlock/core";

import { AppPage } from "../common/enums/app-page.enum.js";
import { LoggerContext } from "../common/enums/logger-context.enum.js";
import { ENV, type Env } from "../config/config.module.js";
import type { AuditEntry } from "../generated/prisma/client.js";
import { DAY_MS } from "../license/constants/license.constants.js";
import { MailService } from "../mail/mail.service.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { AuditService } from "./audit.service.js";
import {
  AUDIT_ARCHIVE,
  AUDIT_ARCHIVE_TIMEOUT_MS,
  AUDIT_PURGE_BATCH,
  AUDIT_PURGE_CHECK_MS,
} from "./constants/audit.constants.js";
import { AuditKind } from "./enums/audit-kind.enum.js";
import type { AuditArchive } from "./types/audit-archive.type.js";
import { toAuditEntry } from "./utils/to-audit-entry.util.js";

@Injectable()
export class PurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(LoggerContext.AUDIT);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(AUDIT_ARCHIVE) private readonly archive: AuditArchive | null,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    if (!this.env.AUDIT_DELETE_AFTER_DAYS || !this.archive) return;
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => this.log.error(err));
    }, AUDIT_PURGE_CHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<number> {
    const org = await this.prisma.organization.findFirst({ select: { id: true } });
    if (!org) return 0;
    const { count } = await orgDb(this.prisma, org.id).auditPurgeRun.createMany({
      data: [{ orgId: org.id, day: now.toISOString().slice(0, 10) }],
      skipDuplicates: true,
    });
    return count === 0 ? 0 : this.run(org.id, now);
  }

  async run(orgId: string, now = new Date()): Promise<number> {
    const days = this.env.AUDIT_DELETE_AFTER_DAYS;
    if (!days || !this.archive) return 0;
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    let deleted = 0;
    for (;;) {
      const rows = await this.prisma.auditEntry.findMany({
        orderBy: { seq: "asc" },
        take: AUDIT_PURGE_BATCH,
      });
      const end = rows.findIndex((r) => r.at >= cutoff);
      const old = end === -1 ? rows : rows.slice(0, end);
      if (old.length === 0) return deleted;
      try {
        const count = await this.purge(orgId, this.archive, old);
        if (count === 0) return deleted;
        deleted += count;
      } catch (err) {
        await this.fail(orgId, old, err);
        return deleted;
      }
      if (old.length < rows.length || rows.length < AUDIT_PURGE_BATCH) return deleted;
    }
  }

  private async purge(orgId: string, archive: AuditArchive, rows: AuditEntry[]): Promise<number> {
    const first = rows[0]!;
    const last = rows.at(-1)!;
    const name = `audit-${String(first.seq)}-${String(last.seq)}.jsonl`;
    const data = new TextEncoder().encode(
      rows.map((r) => `${JSON.stringify(toAuditEntry(r))}\n`).join(""),
    );
    const sha256 = await sha256Hex(data);
    await archive.put(name, data);
    if ((await sha256Hex(await archive.get(name))) !== sha256) {
      throw new Error(`${name} read back with a different SHA-256`);
    }
    return orgDb(this.prisma, orgId).$transaction(
      async (tx) => {
        await this.audit.lock(tx);
        const range = { seq: { gte: first.seq, lte: last.seq } };
        if ((await tx.auditEntry.count({ where: range })) !== rows.length) return 0;
        await tx.auditEntry.deleteMany({ where: range });
        await this.audit.append(
          orgId,
          [
            {
              kind: AuditKind.AUDIT_PURGED,
              payload: {
                fromSeq: first.seq,
                toSeq: last.seq,
                lastHash: last.hash,
                count: rows.length,
                archive: { target: archive.target, name, sha256 },
              },
            },
          ],
          tx,
        );
        return rows.length;
      },
      { timeout: AUDIT_ARCHIVE_TIMEOUT_MS },
    );
  }

  private async fail(orgId: string, rows: AuditEntry[], err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    const fromSeq = rows[0]!.seq;
    const toSeq = rows.at(-1)!.seq;
    this.log.error(`Archiving audit entries ${String(fromSeq)}-${String(toSeq)} failed: ${reason}`);
    await this.audit.append(orgId, [
      { kind: AuditKind.AUDIT_PURGE_FAILED, payload: { fromSeq, toSeq, reason } },
    ]);
    const admins = await orgDb(this.prisma, orgId).user.findMany({
      where: { role: UserRole.ADMIN, disabledAt: null },
      select: { email: true },
    });
    const link = `${this.env.PUBLIC_URL}${AppPage.AUDIT}`;
    await Promise.all(
      admins.map((a) =>
        this.mail.sendAuditArchiveFailed(a.email, { fromSeq, toSeq, reason, link }),
      ),
    );
  }
}
