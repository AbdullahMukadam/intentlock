import { newSecret, sha256Hex } from "../../common/utils/crypto.util.js";
import type { PrismaClient, Role } from "../../generated/prisma/client.js";
import { UserRole } from "../../users/enums/user-role.enum.js";

// Two instances booting together must not both create an organization.
const BOOTSTRAP_LOCK_ID = 7_406_212;

export type BootstrapResult = {
  orgId: string;
  adminId: string | null;
  tokens: Record<string, string>;
};

export async function bootstrapOrg(
  prisma: PrismaClient,
  opts: { orgName: string; adminEmail?: string | undefined; demo: boolean },
): Promise<BootstrapResult | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_ID})`;
    if ((await tx.organization.count()) > 0) return null;

    const org = await tx.organization.create({ data: { name: opts.orgName } });
    const adminEmail = opts.adminEmail?.toLowerCase();
    const domain = adminEmail?.split("@")[1] ?? "example.com";
    const people: { email: string; role: Role; groups: string[] }[] = [
      ...(adminEmail ? [{ email: adminEmail, role: UserRole.ADMIN, groups: [] }] : []),
      ...(opts.demo
        ? [
            { email: `approver@${domain}`, role: UserRole.APPROVER, groups: [] },
            { email: `member@${domain}`, role: UserRole.MEMBER, groups: [] },
            { email: `intern@${domain}`, role: UserRole.MEMBER, groups: ["intern"] },
          ]
        : []),
    ];

    const tokens: Record<string, string> = {};
    let adminId: string | null = null;
    for (const p of people) {
      const token = newSecret();
      const user = await tx.user.create({
        data: { ...p, orgId: org.id, loginTokenHash: sha256Hex(token) },
      });
      if (p.role === UserRole.ADMIN) adminId = user.id;
      tokens[p.email] = token;
    }
    return { orgId: org.id, adminId, tokens };
  });
}
