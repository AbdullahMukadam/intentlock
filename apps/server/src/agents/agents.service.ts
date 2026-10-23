import { ConflictException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { HoldsService } from "../holds/holds.service.js";
import { PrismaErrorCode } from "../common/enums/prisma-error-code.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { newSecret } from "../common/utils/crypto.util.js";
import { emptyVerdictCounts, tallyVerdicts } from "../common/utils/verdict-counts.util.js";
import { Prisma } from "../generated/prisma/client.js";
import { LicensedResource } from "../license/enums/licensed-resource.enum.js";
import { LicenseService } from "../license/license.service.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { WEBHOOK_SECRET_PREFIX } from "./constants/agent.constants.js";
import { AgentError } from "./enums/agent-error.enum.js";
import { createAgent } from "./utils/create-agent.util.js";
import { toAgentView } from "./utils/to-agent-view.util.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DELETED_HOLD_NOTE = "agent deleted";
const VIEW_INCLUDE = {
  policy: { select: { activeVersion: true } },
  _count: { select: { apiKeys: { where: { revokedAt: null } } } },
} as const;

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly license: LicenseService,
    private readonly holds: HoldsService,
  ) {}

  async create(admin: SessionUser, input: { name: string; description?: string | undefined }) {
    const agent = await this.unique(() =>
      orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
        await this.license.assertWithinLimit(tx, LicensedResource.AGENTS);
        const created = await createAgent(tx, admin.orgId, { ...input, createdBy: admin.id });
        await this.audit.append(
          admin.orgId,
          [
            {
              kind: AuditKind.AGENT_CREATED,
              actor: admin.id,
              agentId: created.id,
              policyVersion: 1,
              payload: { name: created.name },
            },
          ],
          tx,
        );
        return created;
      }),
    );
    return this.get(admin.orgId, agent.id);
  }

  async list(orgId: string, includeDeleted = false) {
    const agents = await orgDb(this.prisma, orgId).agent.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      include: VIEW_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    const counts = await this.decisionCounts(
      orgId,
      agents.map((a) => a.id),
    );
    return agents.map((a) => toAgentView(a, counts.get(a.id) ?? emptyVerdictCounts()));
  }

  async get(orgId: string, id: string) {
    const agent = await orgDb(this.prisma, orgId).agent.findFirst({
      where: { id },
      include: VIEW_INCLUDE,
    });
    if (!agent) throw notFound();
    const counts = await this.decisionCounts(orgId, [id]);
    return toAgentView(agent, counts.get(id) ?? emptyVerdictCounts());
  }

  async findOrThrow(orgId: string, id: string) {
    const agent = await orgDb(this.prisma, orgId).agent.findFirst({
      where: { id, deletedAt: null },
    });
    if (!agent) throw notFound();
    return agent;
  }

  async delete(admin: SessionUser, id: string) {
    const target = await this.findOrThrow(admin.orgId, id);
    const announce = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      const { count } = await tx.agent.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw notFound();
      await tx.apiKey.updateMany({
        where: { agentId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const announceHolds = await this.holds.rejectPendingForAgent(
        tx,
        admin,
        id,
        DELETED_HOLD_NOTE,
      );
      await this.audit.append(
        admin.orgId,
        [
          {
            kind: AuditKind.AGENT_DELETED,
            actor: admin.id,
            agentId: id,
            payload: { name: target.name },
          },
        ],
        tx,
      );
      return announceHolds;
    });
    announce();
  }

  async setWebhook(admin: SessionUser, id: string, url: string) {
    await this.findOrThrow(admin.orgId, id);
    const secret = WEBHOOK_SECRET_PREFIX + newSecret();
    await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      await tx.agent.updateMany({
        where: { id, deletedAt: null },
        data: { webhookUrl: url, webhookSecret: secret },
      });
      await this.audit.append(
        admin.orgId,
        [{ kind: AuditKind.AGENT_WEBHOOK_SET, actor: admin.id, agentId: id, payload: { url } }],
        tx,
      );
    });
    return { url, secret };
  }

  async removeWebhook(admin: SessionUser, id: string) {
    const target = await this.findOrThrow(admin.orgId, id);
    if (target.webhookUrl === null) return;
    await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      await tx.agent.updateMany({
        where: { id },
        data: { webhookUrl: null, webhookSecret: null },
      });
      await this.audit.append(
        admin.orgId,
        [
          {
            kind: AuditKind.AGENT_WEBHOOK_REMOVED,
            actor: admin.id,
            agentId: id,
            payload: { url: target.webhookUrl },
          },
        ],
        tx,
      );
    });
  }

  async update(
    admin: SessionUser,
    id: string,
    patch: {
      name?: string | undefined;
      description?: string | null | undefined;
      disabled?: boolean | undefined;
    },
  ) {
    const target = await this.findOrThrow(admin.orgId, id);
    const disabledAt =
      patch.disabled === undefined
        ? undefined
        : patch.disabled
          ? (target.disabledAt ?? new Date())
          : null;
    await this.unique(() =>
      orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
        if (patch.disabled === false && target.disabledAt) {
          await this.license.assertWithinLimit(tx, LicensedResource.AGENTS);
        }
        await tx.agent.update({
          where: { id },
          data: { name: patch.name, description: patch.description, disabledAt },
        });
        await this.audit.append(
          admin.orgId,
          [{ kind: AuditKind.AGENT_UPDATED, actor: admin.id, agentId: id, payload: { ...patch } }],
          tx,
        );
      }),
    );
    return this.get(admin.orgId, id);
  }

  private async decisionCounts(orgId: string, agentIds: string[]) {
    const rows = await orgDb(this.prisma, orgId).auditEntry.groupBy({
      by: ["agentId", "verdict"],
      where: {
        kind: AuditKind.CHECK,
        agentId: { in: agentIds },
        at: { gte: new Date(Date.now() - DAY_MS) },
      },
      _count: { _all: true },
    });
    return tallyVerdicts(rows, (r) => r.agentId);
  }

  private async unique<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: AgentError.AGENT_NAME_TAKEN,
        });
      }
      throw e;
    }
  }
}

function notFound() {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    error: AgentError.AGENT_NOT_FOUND,
  });
}
