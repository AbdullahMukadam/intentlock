import { newSecret, sha256Hex } from "../../common/utils/crypto.util.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { BOOTSTRAP_LOCK_ID } from "../constants/org.constants.js";

export type BootstrapResult = { orgId: string; setupCode: string };

export async function bootstrapOrg(
  prisma: PrismaClient,
  opts: { orgName: string },
): Promise<BootstrapResult | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_ID})`;
    const org =
      (await tx.organization.findFirst()) ??
      (await tx.organization.create({ data: { name: opts.orgName } }));
    if ((await tx.user.count({ where: { orgId: org.id } })) > 0) return null;
    const setupCode = newSecret();
    await tx.organization.update({
      where: { id: org.id },
      data: { setupCodeHash: sha256Hex(setupCode) },
    });
    return { orgId: org.id, setupCode };
  });
}
