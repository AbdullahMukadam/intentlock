import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../../audit/audit.service.js";
import { AuditKind } from "../../audit/enums/audit-kind.enum.js";
import type { SessionUser } from "../../common/types/auth.types.js";
import { ENV, type Env } from "../../config/config.module.js";
import { orgDb } from "../../org/utils/org-db.util.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AgentsService } from "../agents.service.js";
import { ApiKeyError } from "./enums/api-key-error.enum.js";
import { newApiKey } from "./utils/api-key.util.js";
import { emailsById } from "../../users/utils/emails-by-id.util.js";
import { toApiKeyView } from "./utils/to-api-key-view.util.js";

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly agents: AgentsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(admin: SessionUser, agentId: string, name: string) {
    await this.agents.findOrThrow(admin.orgId, agentId);
    const { key, prefix, hash } = newApiKey(this.env.API_KEY_PEPPER);
    const row = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: { orgId: admin.orgId, agentId, name, prefix, hash, createdBy: admin.id },
      });
      await this.audit.append(
        admin.orgId,
        [
          {
            kind: AuditKind.API_KEY_CREATED,
            actor: admin.id,
            agentId,
            payload: { keyId: created.id, name, prefix },
          },
        ],
        tx,
      );
      return created;
    });
    return { id: row.id, prefix, key };
  }

  async list(orgId: string, agentId: string) {
    await this.agents.findOrThrow(orgId, agentId);
    const db = orgDb(this.prisma, orgId);
    const keys = await db.apiKey.findMany({ where: { agentId }, orderBy: { createdAt: "asc" } });
    const emails = await emailsById(
      db,
      keys.map((k) => k.createdBy),
    );
    return keys.map((k) => toApiKeyView(k, emails));
  }

  async revoke(admin: SessionUser, agentId: string, keyId: string) {
    const db = orgDb(this.prisma, admin.orgId);
    const key = await db.apiKey.findFirst({ where: { id: keyId, agentId } });
    if (!key) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: ApiKeyError.API_KEY_NOT_FOUND,
      });
    }
    await db.$transaction(async (tx) => {
      const { count } = await tx.apiKey.updateMany({
        where: { id: keyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return;
      await this.audit.append(
        admin.orgId,
        [
          {
            kind: AuditKind.API_KEY_REVOKED,
            actor: admin.id,
            agentId,
            payload: { keyId, prefix: key.prefix },
          },
        ],
        tx,
      );
    });
  }
}
