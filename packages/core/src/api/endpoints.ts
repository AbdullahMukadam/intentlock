export const API_ENDPOINTS = {
  HEALTH: "/health",
  HEALTH_READY: "/health/ready",
  EVENTS: "/events",

  AUTH_LOGIN: "/v1/auth/login",
  AUTH_LOGOUT: "/v1/auth/logout",
  ME: "/v1/me",

  USERS: "/v1/users",
  USER: "/v1/users/:email",
  USER_TOKEN: "/v1/users/:email/token",

  AGENTS: "/v1/agents",
  AGENT: "/v1/agents/:id",
  AGENT_API_KEYS: "/v1/agents/:id/api-keys",
  AGENT_API_KEY: "/v1/agents/:id/api-keys/:keyId",
  AGENT_POLICY: "/v1/agents/:id/policy",
  AGENT_POLICY_VERSIONS: "/v1/agents/:id/policy/versions",
  AGENT_POLICY_VERSION: "/v1/agents/:id/policy/versions/:version",
  AGENT_POLICY_DRAFT: "/v1/agents/:id/policy/draft",
  AGENT_POLICY_VALIDATE: "/v1/agents/:id/policy/validate",
  AGENT_POLICY_TEST: "/v1/agents/:id/policy/test",
  AGENT_POLICY_PUBLISH: "/v1/agents/:id/policy/publish",
  AGENT_POLICY_ROLLBACK: "/v1/agents/:id/policy/rollback",

  LICENSE: "/v1/license",
  JWKS: "/v1/keys/jwks",

  PLANS: "/v1/plans",
  PLAN_REFRESH: "/v1/plans/:id/refresh",
  CHECK: "/v1/check",
  REPORT: "/v1/report",

  HOLDS: "/v1/holds",
  HOLD_WAIT: "/v1/holds/:id/wait",
  HOLD_APPROVE: "/v1/holds/:id/approve",
  HOLD_REJECT: "/v1/holds/:id/reject",

  AUDIT: "/v1/audit",
  AUDIT_BATCH: "/v1/audit/batch",
  AUDIT_VERIFY: "/v1/audit/verify",

  RUNS: "/v1/runs",
  RUN: "/v1/runs/:planId",
  STATS_OVERVIEW: "/v1/stats/overview",
} as const;

export type ApiEndpoint = (typeof API_ENDPOINTS)[keyof typeof API_ENDPOINTS];

export function apiPath(
  endpoint: ApiEndpoint,
  params: Record<string, string | number> = {},
): string {
  return endpoint.replace(/:(\w+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined)
      throw new TypeError(`Missing path parameter "${name}" for ${endpoint}`);
    return encodeURIComponent(String(value));
  });
}
