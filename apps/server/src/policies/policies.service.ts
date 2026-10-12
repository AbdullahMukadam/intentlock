import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { compareDecisions, parsePolicy, PolicySet, type SampleCall } from "@intentlock/core";

import { AgentsService } from "../agents/agents.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { PolicyError } from "./enums/policy-error.enum.js";
import { CheckPayloadSchema } from "./schemas/check-payload.schema.js";
import { compilePolicy } from "./utils/compile-policy.util.js";
import { toPolicyDraftView } from "./utils/to-policy-draft-view.util.js";
import {
  toPolicyVersionSummary,
  toPolicyVersionView,
} from "./utils/to-policy-version-view.util.js";

@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly agents: AgentsService,
  ) {}

  async get(orgId: string, agentId: string) {
    const set = await this.policySet(orgId, agentId);
    const db = orgDb(this.prisma, orgId);
    const [active, draft] = await Promise.all([
      this.version(db, set.id, set.activeVersion),
      db.policyDraft.findFirst({ where: { policySetId: set.id } }),
    ]);
    return {
      active: toPolicyVersionView(active),
      draft: draft ? toPolicyDraftView(draft) : null,
    };
  }

  async versions(orgId: string, agentId: string) {
    const set = await this.policySet(orgId, agentId);
    const rows = await orgDb(this.prisma, orgId).policyVersion.findMany({
      where: { policySetId: set.id },
      orderBy: { version: "desc" },
    });
    return rows.map(toPolicyVersionSummary);
  }

  async getVersion(orgId: string, agentId: string, version: number) {
    const set = await this.policySet(orgId, agentId);
    return toPolicyVersionView(await this.version(orgDb(this.prisma, orgId), set.id, version));
  }

  validate(source: string) {
    const parsed = parsePolicy(source);
    return parsed.ok ? { ok: true, errors: [] } : { ok: false, errors: parsed.errors };
  }

  async saveDraft(admin: SessionUser, agentId: string, source: string, baseVersion: number) {
    const set = await this.policySet(admin.orgId, agentId);
    const data = { source, baseVersion, updatedBy: admin.id };
    const draft = await orgDb(this.prisma, admin.orgId).policyDraft.upsert({
      where: { policySetId: set.id },
      create: { ...data, orgId: admin.orgId, policySetId: set.id },
      update: data,
    });
    return { draft: toPolicyDraftView(draft), validation: this.validate(source) };
  }

  async test(
    orgId: string,
    agentId: string,
    source: string,
    calls: SampleCall[],
    replayLast?: number,
  ) {
    const { policy } = await compilePolicy(source);
    const set = await this.policySet(orgId, agentId);
    const db = orgDb(this.prisma, orgId);
    const active = await this.version(db, set.id, set.activeVersion);
    const replayed = replayLast ? await this.replaySamples(orgId, agentId, replayLast) : [];
    return compareDecisions(PolicySet.parse(active.compiled), policy, [...calls, ...replayed]);
  }

  async publish(
    admin: SessionUser,
    agentId: string,
    source: string,
    baseVersion: number,
    message: string,
  ) {
    const { policy, hash } = await compilePolicy(source);
    const set = await this.policySet(admin.orgId, agentId);
    const version = baseVersion + 1;
    const created = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      await this.advance(tx, set.id, baseVersion);
      const row = await tx.policyVersion.create({
        data: {
          orgId: admin.orgId,
          policySetId: set.id,
          version,
          source,
          compiled: policy,
          hash,
          message,
          authorId: admin.id,
        },
      });
      await tx.policyDraft.deleteMany({ where: { policySetId: set.id } });
      await this.audit.append(
        admin.orgId,
        [
          {
            kind: AuditKind.POLICY_PUBLISHED,
            actor: admin.id,
            agentId,
            policyVersion: version,
            payload: { version, hash, message },
          },
        ],
        tx,
      );
      return row;
    });
    return toPolicyVersionView(created);
  }

  async rollback(admin: SessionUser, agentId: string, toVersion: number, message: string) {
    const set = await this.policySet(admin.orgId, agentId);
    const db = orgDb(this.prisma, admin.orgId);
    const target = await this.version(db, set.id, toVersion);
    if (toVersion === set.activeVersion) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: PolicyError.ALREADY_ACTIVE,
      });
    }
    const version = set.activeVersion + 1;
    const created = await db.$transaction(async (tx) => {
      await this.advance(tx, set.id, set.activeVersion);
      const row = await tx.policyVersion.create({
        data: {
          orgId: admin.orgId,
          policySetId: set.id,
          version,
          source: target.source,
          compiled: target.compiled ?? {},
          hash: target.hash,
          message,
          authorId: admin.id,
          rolledBackFrom: toVersion,
        },
      });
      await this.audit.append(
        admin.orgId,
        [
          {
            kind: AuditKind.POLICY_ROLLED_BACK,
            actor: admin.id,
            agentId,
            policyVersion: version,
            payload: { version, rolledBackFrom: toVersion, hash: target.hash, message },
          },
        ],
        tx,
      );
      return row;
    });
    return toPolicyVersionView(created);
  }

  // Conditional update: two admins publishing against the same base cannot both win.
  private async advance(tx: OrgTx, policySetId: string, from: number) {
    const { count } = await tx.policySet.updateMany({
      where: { id: policySetId, activeVersion: from },
      data: { activeVersion: from + 1 },
    });
    if (count === 1) return;
    const current = await tx.policySet.findFirst({ where: { id: policySetId } });
    throw new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      error: PolicyError.STALE_BASE_VERSION,
      activeVersion: current?.activeVersion ?? null,
    });
  }

  private async replaySamples(orgId: string, agentId: string, last: number): Promise<SampleCall[]> {
    const db = orgDb(this.prisma, orgId);
    const entries = await db.auditEntry.findMany({
      where: { agentId, kind: AuditKind.CHECK },
      orderBy: { seq: "desc" },
      take: last,
    });
    const emails = [...new Set(entries.map((e) => e.user).filter((u): u is string => !!u))];
    const users = await db.user.findMany({ where: { email: { in: emails } } });
    const byEmail = new Map(users.map((u) => [u.email, u]));
    const samples: SampleCall[] = [];
    for (const entry of entries.reverse()) {
      const payload = CheckPayloadSchema.safeParse(entry.payload);
      if (!payload.success || !entry.user) continue;
      const user = byEmail.get(entry.user);
      samples.push({
        call: payload.data.call,
        inPlan: payload.data.inPlan,
        user: {
          email: entry.user,
          role: user?.role ?? UserRole.MEMBER,
          groups: user?.groups ?? [],
        },
      });
    }
    return samples;
  }

  private async policySet(orgId: string, agentId: string) {
    await this.agents.findOrThrow(orgId, agentId);
    return orgDb(this.prisma, orgId).policySet.findFirstOrThrow({ where: { agentId } });
  }

  private async version(db: Pick<OrgTx, "policyVersion">, policySetId: string, version: number) {
    const row = await db.policyVersion.findFirst({ where: { policySetId, version } });
    if (!row) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: PolicyError.VERSION_NOT_FOUND,
      });
    }
    return row;
  }
}
