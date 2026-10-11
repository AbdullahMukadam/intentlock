import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
  RequestMethod,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { CSRF_HEADER } from "../constants/auth.constants.js";
import { AuthKind } from "../enums/auth-kind.enum.js";
import { ErrorCode } from "../enums/error-code.enum.js";
import { authKindOf } from "../utils/auth-kind.util.js";

const SAFE_METHODS = new Set([
  RequestMethod[RequestMethod.GET],
  RequestMethod[RequestMethod.HEAD],
  RequestMethod[RequestMethod.OPTIONS],
]);

// Cross-site forms can't set custom headers, so this plus SameSite=Lax stops CSRF (ADR-032).
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (authKindOf(this.reflector, ctx) === AuthKind.AGENT) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER)) return true;
    throw new ForbiddenException({
      statusCode: HttpStatus.FORBIDDEN,
      error: ErrorCode.CSRF_HEADER_MISSING,
    });
  }
}
