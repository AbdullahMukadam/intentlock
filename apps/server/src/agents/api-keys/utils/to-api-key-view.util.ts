import type { ApiKey } from "../../../generated/prisma/client.js";

export function toApiKeyView(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    createdBy: key.createdBy,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
  };
}
