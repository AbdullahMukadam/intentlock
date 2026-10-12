import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { Role } from "../../generated/prisma/client.js";
import { ROLES_KEY } from "../constants/auth.constants.js";
import { ErrorCode } from "../enums/error-code.enum.js";
import type { AuthedRequest } from "../types/auth.types.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles) return true;
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (user && roles.includes(user.role)) return true;
    throw new ForbiddenException({ statusCode: HttpStatus.FORBIDDEN, error: ErrorCode.FORBIDDEN });
  }
}
