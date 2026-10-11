import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { CSRF_HEADER } from "../constants/auth.constants.js";
import { authKindOf } from "../utils/auth-kind.util.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Every non-GET request except API-key routes must carry X-Intentlock-CSRF (sign-in included).
 * Cross-site forms can't set custom headers, so this plus SameSite=Lax stops CSRF (§5.6).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (authKindOf(this.reflector, ctx) === "agent") return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER)) return true;
    throw new ForbiddenException({ statusCode: 403, error: "csrf_header_missing" });
  }
}
