import type { Env } from "../../config/env.schema.js";
import type { AuditArchive } from "../types/audit-archive.type.js";
import { FolderArchive } from "./folder-archive.util.js";
import { S3Archive } from "./s3-archive.util.js";

export function archiveFromEnv(env: Env): AuditArchive | null {
  if (
    env.AUDIT_ARCHIVE_S3_URL &&
    env.AUDIT_ARCHIVE_S3_ACCESS_KEY_ID &&
    env.AUDIT_ARCHIVE_S3_SECRET_ACCESS_KEY
  ) {
    return new S3Archive({
      bucketUrl: env.AUDIT_ARCHIVE_S3_URL,
      region: env.AUDIT_ARCHIVE_S3_REGION,
      accessKeyId: env.AUDIT_ARCHIVE_S3_ACCESS_KEY_ID,
      secretAccessKey: env.AUDIT_ARCHIVE_S3_SECRET_ACCESS_KEY,
    });
  }
  if (env.AUDIT_ARCHIVE_DIR) return new FolderArchive(env.AUDIT_ARCHIVE_DIR);
  return null;
}
