import { jcs, sha256Base64url } from "../canonical.js";
import { AuditEntryBody } from "../schemas/audit.js";

export const GENESIS = "GENESIS";

/** ARCHITECTURE §5.4: hash = base64url(sha256(prevHash + "|" + jcs(every field except hash))). */
export async function hashEntry(entry: AuditEntryBody): Promise<string> {
  const body = AuditEntryBody.parse(entry);
  return sha256Base64url(`${body.prevHash}|${jcs(body)}`);
}
