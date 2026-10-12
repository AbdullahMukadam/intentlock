import type { PolicyVersion } from "../../generated/prisma/client.js";

export function toPolicyVersionSummary(v: PolicyVersion) {
  return {
    version: v.version,
    hash: v.hash,
    message: v.message,
    authorId: v.authorId,
    rolledBackFrom: v.rolledBackFrom,
    createdAt: v.createdAt,
  };
}

export function toPolicyVersionView(v: PolicyVersion) {
  return { ...toPolicyVersionSummary(v), source: v.source, compiled: v.compiled };
}
