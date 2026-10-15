import { hashPassword } from "../../auth/utils/password.util.js";
import { newSecret } from "../../common/utils/crypto.util.js";
import type { Role } from "../../generated/prisma/client.js";
import { UserRole } from "../../users/enums/user-role.enum.js";
import type { OrgTx } from "./org-db.util.js";

export async function createDemoUsers(
  db: Pick<OrgTx, "user">,
  orgId: string,
  domain: string,
): Promise<Record<string, string>> {
  const people: { email: string; role: Role; groups: string[] }[] = [
    { email: `approver@${domain}`, role: UserRole.APPROVER, groups: [] },
    { email: `member@${domain}`, role: UserRole.MEMBER, groups: [] },
    { email: `intern@${domain}`, role: UserRole.MEMBER, groups: ["intern"] },
  ];
  const passwords: Record<string, string> = {};
  for (const p of people) {
    const password = newSecret();
    await db.user.create({ data: { ...p, orgId, passwordHash: await hashPassword(password) } });
    passwords[p.email] = password;
  }
  return passwords;
}
