import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";

import { ErrorCode } from "../../common/enums/error-code.enum.js";
import type { AuthedRequest } from "../../common/types/auth.types.js";
import { authKindOf } from "../../common/utils/auth-kind.util.js";
import { ENV, type Env } from "../../config/config.module.js";
import { SESSION_COOKIE } from "../constants/session.constants.js";
import { SessionsService } from "../sessions.service.js";
import { readCookie, setSessionCookie } from "../utils/session-cookie.util.js";

// Default deny: every route needs a session unless it is @Public() or @AgentAuth().
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (authKindOf(this.reflector, ctx)) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const cookie = readCookie(req, SESSION_COOKIE);
    const session = await this.sessions.resolveCookie(cookie);
    if (!session || !cookie) {
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: ErrorCode.UNAUTHORIZED,
      });
    }
    if (await this.sessions.slide(session)) {
      setSessionCookie(
        ctx.switchToHttp().getResponse<Response>(),
        cookie,
        this.env.PUBLIC_URL.startsWith("https:"),
      );
    }
    req.user = session.user;
    return true;
  }
}
