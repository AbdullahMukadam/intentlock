import type { SessionUser } from "../../common/types/auth.types.js";

export type ResolvedSession = { user: SessionUser; expiresAt: Date };
