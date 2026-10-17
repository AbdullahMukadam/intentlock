import type { SessionUser } from "../../common/types/auth.types.js";

export type SessionRow = Omit<SessionUser, "sessionId"> & { expiresAt: Date };
