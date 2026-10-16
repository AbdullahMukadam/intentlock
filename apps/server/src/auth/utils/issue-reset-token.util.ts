import { newSecret, sha256Hex } from "../../common/utils/crypto.util.js";
import type { OrgTx } from "../../org/utils/org-db.util.js";

export async function issueResetToken(
  db: Pick<OrgTx, "passwordReset">,
  opts: { orgId: string; userId: string; createdBy: string | null; ttlMs: number },
) {
  const token = newSecret();
  const expiresAt = new Date(Date.now() + opts.ttlMs);
  await db.passwordReset.create({
    data: {
      orgId: opts.orgId,
      userId: opts.userId,
      createdBy: opts.createdBy,
      tokenHash: sha256Hex(token),
      expiresAt,
    },
  });
  return { token, expiresAt };
}
