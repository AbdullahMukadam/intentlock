import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthedRequest } from "../types/auth.types.js";

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user!,
);
