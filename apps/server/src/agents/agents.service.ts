import { ConflictException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../audit/enums/audit-verdict.enum.js";
import { PrismaErrorCode } from "../common/enums/prisma-error-code.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { Prisma } from "../generated/prisma/client.js";
import { LicensedResource } from "../license/enums/licensed-resource.enum.js";
import { LicenseService } from "../license/license.service.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AgentError } from "./enums/agent-error.enum.js";
import type { AgentDecisionCounts } from "./types/agent-decision-counts.type.js";
import { createAgent } from "./utils/create-agent.util.js";
import { toAgentView } from "./utils/to-agent-view.util.js";

const DAY_MS = 24 * 60 * 60 * 1000;
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

  async list(orgId: string) {
    const agents = await orgDb(this.prisma, orgId).agent.findMany({
      include: VIEW_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    const counts = await this.decisionCounts(
      orgId,
      agents.map((a) => a.id),
    );
    return agents.map((a) => toAgentView(a, counts.get(a.id) ?? emptyCounts()));
  }

  async get(orgId: string, id: string) {
    const agent = await orgDb(this.prisma, orgId).agent.findFirst({
      where: { id },
      include: VIEW_INCLUDE,
    });
    if (!agent) throw notFound();
    const counts = await this.decisionCounts(orgId, [id]);
    return toAgentView(agent, counts.get(id) ?? emptyCounts());
  }

  async findOrThrow(orgId: string, id: string) {
    const agent = await orgDb(this.prisma, orgId).agent.findFirst({ where: { id } });
    if (!agent) throw notFound();
    return agent;
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
    const counts = new Map<string, AgentDecisionCounts>();
    for (const row of rows) {
      if (!row.agentId) continue;
      const c = counts.get(row.agentId) ?? emptyCounts();
      if (row.verdict === AuditVerdict.ALLOW) c.allow += row._count._all;
      if (row.verdict === AuditVerdict.BLOCK) c.block += row._count._all;
      if (row.verdict === AuditVerdict.HOLD) c.hold += row._count._all;
      counts.set(row.agentId, c);
    }
    return counts;
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

function emptyCounts(): AgentDecisionCounts {
  return { allow: 0, block: 0, hold: 0 };
}

function notFound() {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    error: AgentError.AGENT_NOT_FOUND,
  });
}
