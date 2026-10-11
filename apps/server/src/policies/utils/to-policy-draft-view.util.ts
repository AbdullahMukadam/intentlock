import type { PolicyDraft } from "../../generated/prisma/client.js";

export function toPolicyDraftView(d: PolicyDraft) {
  return {
    source: d.source,
    baseVersion: d.baseVersion,
    updatedBy: d.updatedBy,
    updatedAt: d.updatedAt,
  };
}
