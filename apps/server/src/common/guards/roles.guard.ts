import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { Role } from "../../generated/prisma/client.js";
import { ROLES_KEY } from "../constants/auth.constants.js";
import type { AuthedRequest } from "../types/auth.types.js";

/** Runs after SessionGuard; enforces @Roles(...) on session routes. */
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
    throw new ForbiddenException({ statusCode: 403, error: "forbidden" });
  }
}
