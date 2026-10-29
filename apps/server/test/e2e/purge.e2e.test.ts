import type { INestApplication } from "@nestjs/common";
import { verifyChain } from "@intentlock/core";
import request from "supertest";

import { AuditService } from "../../src/audit/audit.service.js";
import { AUDIT_ARCHIVE } from "../../src/audit/constants/audit.constants.js";
import { ArchiveTarget } from "../../src/audit/enums/archive-target.enum.js";
import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { PurgeService } from "../../src/audit/purge.service.js";
import type { AuditArchive } from "../../src/audit/types/audit-archive.type.js";
import { toAuditEntry } from "../../src/audit/utils/to-audit-entry.util.js";
import { ENV, type Env } from "../../src/config/config.module.js";
import { MailService } from "../../src/mail/mail.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import { backdateEntries, createOrg, createTestApp, FakeMail, signedIn } from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

class FakeArchive implements AuditArchive {
  readonly target = ArchiveTarget.FOLDER;
  readonly location = "memory";
  files = new Map<string, Uint8Array>();
  failPut = false;
  corrupt = false;

  put(name: string, data: Uint8Array): Promise<void> {
    if (this.failPut) return Promise.reject(new Error("disk full"));
    this.files.set(name, data);
    return Promise.resolve();
  }

  get(name: string): Promise<Uint8Array> {
    const data = this.files.get(name);
    if (!data) return Promise.reject(new Error(`${name} not found`));
    return Promise.resolve(this.corrupt ? data.slice(1) : data);
  }

  entries(name: string): unknown[] {
    return new TextDecoder()
      .decode(this.files.get(name))
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as unknown);
  }
}

const prisma = testPrisma();
const archive = new FakeArchive();
const mail = new FakeMail();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
const http = () => request(app.getHttpServer());
const purge = () => app.get(PurgeService);
const tools = async () =>
  (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map((e) => e.tool ?? e.kind);

beforeAll(async () => {
  app = await createTestApp({
    override: (b) =>
      b
        .overrideProvider(AUDIT_ARCHIVE)
        .useValue(archive)
        .overrideProvider(MailService)
        .useValue(mail),
  });
  app.get<Env>(ENV).AUDIT_DELETE_AFTER_DAYS = 90;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  archive.files.clear();
  archive.failPut = false;
  archive.corrupt = false;
  mail.sent = [];
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  const audit = app.get(AuditService);
  for (const tool of ["t1", "t2", "t3", "t4", "t5"]) {
    await audit.append(orgId, [{ kind: AuditKind.CHECK, tool }]);
  }
  await backdateEntries(prisma, [1, 2, 3], 100);
});

describe("deleting old audit entries", () => {
  it("archives, then deletes, and the chain still verifies from the archive and the database", async () => {
    expect(await purge().run(orgId)).toBe(3);
    expect([...archive.files.keys()]).toEqual(["audit-1-3.jsonl"]);
    expect(await tools()).toEqual(["t4", "t5", AuditKind.AUDIT_PURGED]);
    const anchor = await prisma.auditEntry.findFirstOrThrow({
      where: { kind: AuditKind.AUDIT_PURGED },
    });
    expect(anchor.payload).toMatchObject({ fromSeq: 1, toSeq: 3, count: 3 });

    const verify = await http().get("/v1/audit/verify").set("Cookie", admin.cookie).expect(200);
    expect(verify.body).toMatchObject({ ok: true, fromSeq: 4, count: 3 });

    const rest = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(toAuditEntry);
    expect(await verifyChain([...archive.entries("audit-1-3.jsonl"), ...rest])).toEqual({
      ok: true,
      count: 7,
    });

    const summary = await http().get("/v1/audit/summary").set("Cookie", admin.cookie).expect(200);
    expect(summary.body.deletion).toMatchObject({
      afterDays: 90,
      target: "folder",
      lastRun: { toSeq: 3, count: 3 },
    });
  });

  it("rows deleted without an archive fail verify", async () => {
    await prisma.auditEntry.deleteMany({ where: { seq: { lte: 2 } } });
    const verify = await http().get("/v1/audit/verify").set("Cookie", admin.cookie).expect(200);
    expect(verify.body).toMatchObject({ ok: false, firstBrokenSeq: 3 });
  });

  it("a failed archive write deletes nothing, is audited and emails admins", async () => {
    archive.failPut = true;
    expect(await purge().run(orgId)).toBe(0);
    expect(await prisma.auditEntry.count({ where: { kind: AuditKind.CHECK } })).toBe(5);
    const failed = await prisma.auditEntry.findFirstOrThrow({
      where: { kind: AuditKind.AUDIT_PURGE_FAILED },
    });
    expect(failed.payload).toMatchObject({ fromSeq: 1, toSeq: 3, reason: "disk full" });
    expect(mail.sent).toEqual([
      expect.objectContaining({
        to: admin.user.email,
        subject: "Intentlock could not archive old audit entries",
      }),
    ]);
  });

  it("an archive that reads back differently deletes nothing", async () => {
    archive.corrupt = true;
    expect(await purge().run(orgId)).toBe(0);
    expect(await prisma.auditEntry.count({ where: { kind: AuditKind.CHECK } })).toBe(5);
  });

  it("runs once a day, and two runs at once delete each entry once", async () => {
    const now = new Date();
    expect(await purge().tick(now)).toBe(3);
    await backdateEntries(prisma, [4], 100);
    expect(await purge().tick(now)).toBe(0);
    expect(await prisma.auditEntry.count({ where: { tool: "t4" } })).toBe(1);

    await resetDb(prisma);
    orgId = await createOrg(prisma);
    for (const tool of ["a", "b", "c"]) {
      await app.get(AuditService).append(orgId, [{ kind: AuditKind.CHECK, tool }]);
    }
    await backdateEntries(prisma, [1, 2], 100);
    const results = await Promise.all([purge().run(orgId), purge().run(orgId)]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(2);
    expect(await prisma.auditEntry.count({ where: { kind: AuditKind.AUDIT_PURGED } })).toBe(1);
  });

  it("does nothing when deletion is off", async () => {
    const env = app.get<Env>(ENV);
    env.AUDIT_DELETE_AFTER_DAYS = undefined;
    try {
      expect(await purge().run(orgId)).toBe(0);
      expect(archive.files.size).toBe(0);
    } finally {
      env.AUDIT_DELETE_AFTER_DAYS = 90;
    }
  });
});
