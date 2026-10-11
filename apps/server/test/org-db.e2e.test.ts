import { createAgent } from "../src/agents/utils/create-agent.util.js";
import { orgDb } from "../src/org/utils/org-db.util.js";
import { resetDb, testPrisma } from "./setup.js";
import { UserRole } from "../src/users/enums/user-role.enum.js";

const prisma = testPrisma();

afterAll(() => prisma.$disconnect());

describe("orgDb", () => {
  let a: string;
  let b: string;

  beforeEach(async () => {
    await resetDb(prisma);
    a = (await prisma.organization.create({ data: { name: "A" } })).id;
    b = (await prisma.organization.create({ data: { name: "B" } })).id;
    await orgDb(prisma, a).user.create({ data: { orgId: a, email: "x@a.dev" } });
    await orgDb(prisma, b).user.create({ data: { orgId: b, email: "x@b.dev" } });
  });

  it("scopes reads, counts, updates and deletes to the org", async () => {
    const db = orgDb(prisma, a);
    expect((await db.user.findMany()).map((u) => u.email)).toEqual(["x@a.dev"]);
    expect(await db.user.count()).toBe(1);
    const other = await prisma.user.findFirstOrThrow({ where: { orgId: b } });
    expect(await db.user.findUnique({ where: { id: other.id } })).toBeNull();
    expect((await db.user.updateMany({ data: { role: UserRole.ADMIN } })).count).toBe(1);
    expect((await db.user.deleteMany({})).count).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("overwrites orgId on create, even when the caller passes another org", async () => {
    const user = await orgDb(prisma, a).user.create({ data: { orgId: b, email: "y@a.dev" } });
    expect(user.orgId).toBe(a);
  });

  it("creates an agent with the starter policy as v1", async () => {
    const db = orgDb(prisma, a);
    const agent = await createAgent(db, a, { name: "bot", createdBy: "u1" });
    const set = await db.policySet.findUniqueOrThrow({
      where: { agentId: agent.id },
      include: { versions: true },
    });
    expect(set.activeVersion).toBe(1);
    expect(set.versions).toHaveLength(1);
    expect(set.versions[0]?.orgId).toBe(a);
  });
});
