import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthedRequest } from "../../../common/types/auth.types.js";
import { authKindOf } from "../../../common/utils/auth-kind.util.js";
import { ENV, type Env } from "../../../config/config.module.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { hashApiKey } from "../utils/api-key.util.js";

const LAST_USED_GRANULARITY_MS = 60_000;

/** Authenticates @AgentAuth() routes with a Bearer API key; revoked keys are rejected everywhere. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (authKindOf(this.reflector, ctx) !== "agent") return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.get("authorization");
    const key = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!key) throw unauthorized();

    const row = await this.prisma.apiKey.findUnique({
      where: { hash: hashApiKey(key, this.env.API_KEY_PEPPER) },
    });
    if (!row || row.revokedAt) throw unauthorized();
    const now = new Date();
    await this.prisma.apiKey.updateMany({
      where: {
        id: row.id,
        OR: [
          { lastUsedAt: null },
          { lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_GRANULARITY_MS) } },
        ],
      },
      data: { lastUsedAt: now },
    });
    req.agent = { orgId: row.orgId, agentId: row.agentId, apiKeyId: row.id };
    return true;
  }
}

function unauthorized() {
  return new UnauthorizedException({ statusCode: 401, error: "unauthorized" });
}
