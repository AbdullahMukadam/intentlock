import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";

import type { Role } from "../generated/prisma/client.js";

export const AUTH_KIND = "intentlock:auth";
export const ROLES = "intentlock:roles";
export type AuthKind = "public" | "agent";

/** Opens a route to anyone. Only sign-in, health and JWKS (ARCHITECTURE §5.6); routes.e2e.test.ts pins the list. */
export const Public = () => SetMetadata(AUTH_KIND, "public" satisfies AuthKind);
/** API-key routes (agent apps). Sessions are not accepted there. */
export const AgentAuth = () => SetMetadata(AUTH_KIND, "agent" satisfies AuthKind);
/** Session routes limited to these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export type SessionUser = {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  groups: string[];
  sessionId: string;
};
export type AgentCaller = { orgId: string; agentId: string; apiKeyId: string };

export type AuthedRequest = Request & { user?: SessionUser; agent?: AgentCaller };

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user!,
);
export const CurrentAgent = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().agent!,
);
