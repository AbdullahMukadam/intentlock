import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";

import {
  CSRF_HEADER,
  readCookie,
  SESSION_COOKIE,
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_MS,
  setSessionCookie,
} from "../auth/session.js";
import { ENV, type Env } from "../config/config.module.js";
import type { Role } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  type AgentCaller,
  AUTH_KIND,
  type AuthedRequest,
  type AuthKind,
  ROLES,
  type SessionUser,
} from "./auth.decorators.js";
import { hashApiKey, sha256Hex } from "./secrets.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LAST_USED_GRANULARITY_MS = 60_000;

/** Global default-deny guard (ARCHITECTURE §5.6): every route needs a session unless marked otherwise. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const kind = this.reflector.getAllAndOverride<AuthKind | undefined>(AUTH_KIND, targets);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    if (kind === "agent") {
      req.agent = await this.agentFromKey(req.get("authorization"));
      return true;
    }
    // Cross-site forms can't set custom headers, so this plus SameSite=Lax stops CSRF (§5.6).
    if (!SAFE_METHODS.has(req.method) && !req.get(CSRF_HEADER)) {
      throw new ForbiddenException({ statusCode: 403, error: "csrf_header_missing" });
    }
    if (kind === "public") return true;

    req.user = await this.userFromSession(req, ctx.switchToHttp().getResponse<Response>());
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(req.user.role)) {
      throw new ForbiddenException({ statusCode: 403, error: "forbidden" });
    }
    return true;
  }

  private async agentFromKey(header: string | undefined): Promise<AgentCaller> {
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
    return { orgId: row.orgId, agentId: row.agentId, apiKeyId: row.id };
  }

  private async userFromSession(req: AuthedRequest, res: Response): Promise<SessionUser> {
    const cookie = readCookie(req, SESSION_COOKIE);
    if (!cookie) throw unauthorized();
    const session = await this.prisma.session.findUnique({ where: { id: sha256Hex(cookie) } });
    const now = Date.now();
    if (!session || session.expiresAt.getTime() <= now) throw unauthorized();
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.disabledAt || user.orgId !== session.orgId) throw unauthorized();

    if (session.expiresAt.getTime() - now < SESSION_TTL_MS - SESSION_REFRESH_AFTER_MS) {
      await this.prisma.session.updateMany({
        where: { id: session.id },
        data: { expiresAt: new Date(now + SESSION_TTL_MS) },
      });
      setSessionCookie(res, cookie, this.env.PUBLIC_URL.startsWith("https:"));
    }
    return {
      id: user.id,
      orgId: user.orgId,
      email: user.email,
      role: user.role,
      groups: user.groups,
      sessionId: session.id,
    };
  }
}

function unauthorized() {
  return new UnauthorizedException({ statusCode: 401, error: "unauthorized" });
}
