import type { AuditQueryDto } from "../dto/audit-query.dto.js";

export type AuditFilter = Omit<AuditQueryDto, "cursor" | "limit" | "format">;
