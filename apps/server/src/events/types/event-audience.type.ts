import type { ApproverSpec } from "@intentlock/core";

export type EventAudience = { orgId: string; user: string | null; approvers?: ApproverSpec };
