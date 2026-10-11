import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";

import type { AuthedRequest, SessionUser } from "../../common/types/auth.types.js";
import { authKindOf } from "../../common/utils/auth-kind.util.js";
import { sha256Hex } from "../../common/utils/crypto.util.js";
import { ENV, type Env } from "../../config/config.module.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  SESSION_COOKIE,
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_MS,
} from "../constants/session.constants.js";
import { readCookie, setSessionCookie } from "../utils/session-cookie.util.js";

/** Default deny (ARCHITECTURE §5.6): every route needs a session unless it is @Public() or @AgentAuth(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (authKindOf(this.reflector, ctx)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.user = await this.userFromSession(req, ctx.switchToHttp().getResponse<Response>());
    return true;
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
