import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import { AUTH_KIND_KEY } from "../constants/auth.constants.js";
import type { AuthKind } from "../types/auth.types.js";

export function authKindOf(reflector: Reflector, ctx: ExecutionContext): AuthKind | undefined {
  return reflector.getAllAndOverride<AuthKind | undefined>(AUTH_KIND_KEY, [
    ctx.getHandler(),
    ctx.getClass(),
  ]);
}
