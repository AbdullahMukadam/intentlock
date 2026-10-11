import type { Request } from "express";

import type { Role } from "../../generated/prisma/client.js";

/** How a route authenticates; unset = session (default deny, ARCHITECTURE §5.6). */
export type AuthKind = "public" | "agent";

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
