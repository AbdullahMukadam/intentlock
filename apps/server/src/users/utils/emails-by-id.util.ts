import type { OrgDb } from "../../org/utils/org-db.util.js";

export async function emailsById(
  db: Pick<OrgDb, "user">,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.email]));
}
