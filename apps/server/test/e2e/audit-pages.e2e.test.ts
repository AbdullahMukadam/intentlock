import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditService } from "../../src/audit/audit.service.js";
import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../../src/audit/enums/audit-verdict.enum.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import { createOrg, createTestApp, signedIn } from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const prisma = testPrisma();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let member: Awaited<ReturnType<typeof signedIn>>;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  member = await signedIn(prisma, orgId, UserRole.MEMBER);
  await prisma.auditEntry.deleteMany({});
  const checks = (user: string, verdict: AuditVerdict, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      kind: AuditKind.CHECK,
      user,
      tool: `tool_${user.split("@")[0]}_${i}`,
      verdict,
    }));
  await app
    .get(AuditService)
    .append(orgId, [
      ...checks(member.user.email, AuditVerdict.ALLOW, 4),
      ...checks(admin.user.email, AuditVerdict.BLOCK, 3),
    ]);
});

const page = (cookie: string, query: Record<string, string | number>) =>
  request(app.getHttpServer()).get("/v1/audit").query(query).set("Cookie", cookie);

describe("numbered audit pages", () => {
  it("returns a page of entries, newest first, with the total", async () => {
    const first = await page(admin.cookie, { page: 1, limit: 3 }).expect(200);
    expect(first.body).toMatchObject({ total: 7, page: 1, nextCursor: null });
    const seqs = (first.body.entries as { seq: number }[]).map((e) => e.seq);
    expect(seqs).toHaveLength(3);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));

    const third = await page(admin.cookie, { page: 3, limit: 3 }).expect(200);
    expect(third.body.entries).toHaveLength(1);
    expect(third.body.entries[0].seq).toBeLessThan(Math.min(...seqs));
  });

  it("returns an empty page past the end, still with the total", async () => {
    const res = await page(admin.cookie, { page: 9, limit: 3 }).expect(200);
    expect(res.body).toMatchObject({ entries: [], total: 7, page: 9 });
  });

  it("counts with the filters applied", async () => {
    const res = await page(admin.cookie, { page: 1, limit: 2, verdict: "block" }).expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.entries).toHaveLength(2);
  });

  it("counts only a member's own entries", async () => {
    const res = await page(member.cookie, { page: 1, limit: 50 }).expect(200);
    expect(res.body.total).toBe(4);
    expect(
      (res.body.entries as { user: string }[]).every((e) => e.user === member.user.email),
    ).toBe(true);
  });

  it("rejects bad page numbers and keeps cursor paging without a page", async () => {
    await page(admin.cookie, { page: 0 }).expect(400);
    await page(admin.cookie, { page: 10_001 }).expect(400);
    const cursor = await page(admin.cookie, { limit: 5 }).expect(200);
    expect(cursor.body.total).toBeUndefined();
    expect(cursor.body.nextCursor).toEqual(expect.any(Number));
  });
});
