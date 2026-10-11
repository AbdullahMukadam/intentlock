import type { AuditEntry } from "@intentlock/core";

import type { AuditEntry as AuditEntryRow } from "../../generated/prisma/client.js";

/** A database row in the exact shape core hashes (ADR-030 point 9). */
export function toAuditEntry(row: AuditEntryRow): AuditEntry {
  return {
    ...row,
    origin: row.origin as AuditEntry["origin"],
    at: row.at.toISOString(),
    clientAt: row.clientAt?.toISOString() ?? null,
    payload: row.payload as AuditEntry["payload"],
  };
}
