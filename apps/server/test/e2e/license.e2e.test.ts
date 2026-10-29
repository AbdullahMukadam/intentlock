import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { generateSigningKeyPair } from "@intentlock/core";
import { CompactSign } from "jose";
import request from "supertest";

import { ENV, type Env } from "../../src/config/config.module.js";
import { VENDOR_PUBLIC_KEY } from "../../src/license/constants/license.constants.js";
import { LicenseEdition } from "../../src/license/enums/license-edition.enum.js";
import { LicenseStatus } from "../../src/license/enums/license-status.enum.js";
import { LicenseService } from "../../src/license/license.service.js";
import { MailService } from "../../src/mail/mail.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  createUser,
  CSRF,
  FakeMail,
  planFor,
  signedIn,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const prisma = testPrisma();
const dir = mkdtempSync(join(tmpdir(), "intentlock-license-"));
const vendor = await generateSigningKeyPair();
const stranger = await generateSigningKeyPair();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;

const PAID = {
  licensee: "Acme",
  edition: LicenseEdition.LICENSED,
  maxUsers: 25,
  maxAgents: null,
  retentionDays: 365,
};

async function useLicense(
  payload: object | null,
  key: CryptoKey = vendor.privateKey,
  raw?: string,
) {
  const env = app.get<Env>(ENV);
  if (payload === null && raw === undefined) {
    env.LICENSE_FILE = undefined;
  } else {
    const file = join(dir, `license-${Math.random().toString(36).slice(2)}.jws`);
    const jws =
      raw ??
      (await new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
        .setProtectedHeader({ alg: "EdDSA" })
        .sign(key));
    writeFileSync(file, jws);
    env.LICENSE_FILE = file;
  }
  const license = app.get(LicenseService);
  await license.load();
  return license;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const inOneYear = () => nowSec() + 365 * 86_400;
const pastGrace = () => nowSec() - 15 * 86_400;
const mail = new FakeMail();
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await createTestApp({
    override: (b) =>
      b
        .overrideProvider(VENDOR_PUBLIC_KEY)
        .useValue(vendor.publicKey)
        .overrideProvider(MailService)
        .useValue(mail),
  });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  await useLicense(null);
  mail.sent = [];
});

describe("license verification", () => {
  it("falls back to the free limits without a license file", async () => {
    const res = await http().get("/v1/license").set("Cookie", admin.cookie).expect(200);
    expect(res.body).toMatchObject({
      edition: "free",
      maxUsers: 5,
      usedUsers: 1,
      maxAgents: 3,
      usedAgents: 0,
      expiresAt: null,
    });
  });

  it("applies a valid license", async () => {
    const license = await useLicense({ ...PAID, exp: inOneYear() });
    expect(license.currentStatus()).toBe(LicenseStatus.VALID);
    const res = await http().get("/v1/license").set("Cookie", admin.cookie).expect(200);
    expect(res.body).toMatchObject({
      edition: "licensed",
      licensee: "Acme",
      maxUsers: 25,
      maxAgents: null,
    });
    expect(res.body.expiresAt).toMatch(/^\d{4}-/);
  });

  it("falls back to the free limits when expired, badly signed or unreadable", async () => {
    const cases: [object | null, CryptoKey | undefined, string | undefined, LicenseStatus][] = [
      [{ ...PAID, exp: pastGrace() }, undefined, undefined, LicenseStatus.EXPIRED],
      [{ ...PAID, exp: inOneYear() }, stranger.privateKey, undefined, LicenseStatus.INVALID],
      [null, undefined, "not a jws", LicenseStatus.INVALID],
      [{ ...PAID, exp: inOneYear(), edition: "team" }, undefined, undefined, LicenseStatus.INVALID],
    ];
    for (const [payload, key, raw, status] of cases) {
      const license = await useLicense(payload, key, raw);
      expect(license.currentStatus()).toBe(status);
      expect(license.current().edition).toBe(LicenseEdition.FREE);
    }
  });
});

describe("license limits", () => {
  const createAgent = (name: string) =>
    http().post("/v1/agents").set("Cookie", admin.cookie).set(CSRF).send({ name });

  it("enforces maxAgents; disabling or deleting an agent frees a seat; re-enabling at the limit fails", async () => {
    for (const name of ["a1", "a2", "a3"]) await createAgent(name).expect(201);
    const over = await createAgent("a4").expect(403);
    expect(over.body).toMatchObject({ error: "agent_limit_reached", max: 3 });

    const a1 = await prisma.agent.findFirstOrThrow({ where: { name: "a1" } });
    await http()
      .patch(`/v1/agents/${a1.id}`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ disabled: true })
      .expect(200);
    await createAgent("a4").expect(201);
    await createAgent("a5").expect(403);
    const a2 = await prisma.agent.findFirstOrThrow({ where: { name: "a2" } });
    await http().delete(`/v1/agents/${a2.id}`).set("Cookie", admin.cookie).set(CSRF).expect(204);
    await createAgent("a5").expect(201);
    await http()
      .patch(`/v1/agents/${a1.id}`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ disabled: false })
      .expect(403);
  });

  it("enforces maxUsers when re-enabling a user (the admin counts)", async () => {
    for (let i = 0; i < 4; i++) await createUser(prisma, orgId);
    const { user } = await createUser(prisma, orgId);
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    const over = await http()
      .patch(`/v1/users/${user.email}`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ disabled: false })
      .expect(403);
    expect(over.body).toMatchObject({ error: "user_limit_reached", max: 5 });
  });

  it("concurrent creates cannot overshoot the limit", async () => {
    const results = await Promise.all(["c1", "c2", "c3", "c4", "c5"].map((n) => createAgent(n)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 403)).toHaveLength(2);
  });

  it("a valid license raises the limit", async () => {
    await useLicense({ ...PAID, exp: inOneYear() });
    for (const name of ["a1", "a2", "a3", "a4"]) await createAgent(name).expect(201);
  });
});

describe("license never changes enforcement", () => {
  it("an expired license yields exactly the same decisions as a valid one", async () => {
    const bot = await createAgentWithKey(prisma, orgId);
    const calls = [
      call("github_list_issues", { repo: "acme/app" }),
      call("github_list_issues", { repo: "acme/private" }),
      call("github_create_pull_request"),
    ];
    const decide = async () => {
      const plan = await http()
        .post("/v1/plans")
        .set(bot.auth)
        .send({
          plan: planFor(admin.user.email, [
            { tool: "github_list_issues", args: { repo: { eq: "acme/app" } } },
          ]),
        })
        .expect(201);
      const out = [];
      for (const c of calls) {
        const res = await http()
          .post("/v1/check")
          .set(bot.auth)
          .send({ token: plan.body.token, call: c })
          .expect(200);
        out.push(res.body);
      }
      return out;
    };
    await useLicense({ ...PAID, exp: inOneYear() });
    const valid = await decide();
    await useLicense({ ...PAID, exp: pastGrace() });
    const expired = await decide();
    expect(expired).toEqual(valid);
    expect(valid.map((d) => d.verdict)).toEqual(["allow", "block", "block"]);
  });
});

describe("license applied in the inbox", () => {
  const sign = (payload: object, key: CryptoKey = vendor.privateKey) =>
    new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
      .setProtectedHeader({ alg: "EdDSA" })
      .sign(key);
  const put = (cookie: string, key: string) =>
    http().put("/v1/license").set("Cookie", cookie).set(CSRF).send({ key });
  const kinds = async () => (await prisma.auditEntry.findMany()).map((e) => e.kind);

  it("an admin applies a key: stored, audited, limits lifted", async () => {
    const res = await put(admin.cookie, await sign({ ...PAID, exp: inOneYear() })).expect(200);
    expect(res.body).toMatchObject({
      edition: "licensed",
      status: "valid",
      source: "database",
      licensee: "Acme",
      maxUsers: 25,
    });
    expect(await prisma.license.count()).toBe(1);
    expect(await kinds()).toContain("license_applied");
    for (const name of ["a1", "a2", "a3", "a4"])
      await http()
        .post("/v1/agents")
        .set("Cookie", admin.cookie)
        .set(CSRF)
        .send({ name })
        .expect(201);
  });

  it("refuses a bad signature, an expired key, garbage and non-admins, storing nothing", async () => {
    const forged = await put(
      admin.cookie,
      await sign({ ...PAID, exp: inOneYear() }, stranger.privateKey),
    ).expect(400);
    expect(forged.body).toMatchObject({ error: "license_invalid" });
    const expired = await put(
      admin.cookie,
      await sign({ ...PAID, exp: Math.floor(Date.now() / 1000) - 1 }),
    ).expect(400);
    expect(expired.body).toMatchObject({ error: "license_expired" });
    await put(admin.cookie, "not a jws").expect(400);
    for (const role of [UserRole.APPROVER, UserRole.MEMBER]) {
      const other = await signedIn(prisma, orgId, role);
      await put(other.cookie, await sign({ ...PAID, exp: inOneYear() })).expect(403);
    }
    expect(await prisma.license.count()).toBe(0);
    expect(app.get(LicenseService).current().edition).toBe(LicenseEdition.FREE);
  });

  it("a stored key edited in the database falls back to the free limits", async () => {
    await put(admin.cookie, await sign({ ...PAID, exp: inOneYear() })).expect(200);
    const row = await prisma.license.findFirstOrThrow();
    const [header, , signature] = row.jws.split(".");
    const bigger = Buffer.from(
      JSON.stringify({ ...PAID, maxUsers: 9999, exp: inOneYear() }),
    ).toString("base64url");
    await prisma.license.update({
      where: { id: row.id },
      data: { jws: `${header}.${bigger}.${signature}` },
    });
    const license = app.get(LicenseService);
    await license.load();
    expect(license.currentStatus()).toBe(LicenseStatus.INVALID);
    expect(license.current().maxUsers).toBe(5);
  });

  it("a clock set back does not revive an expired license", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await put(admin.cookie, await sign({ ...PAID, exp })).expect(200);
    await prisma.organization.update({
      where: { id: orgId },
      data: { licenseClockAt: new Date((exp + 15 * 86_400) * 1000) },
    });
    const license = app.get(LicenseService);
    await license.load();
    expect(license.currentStatus()).toBe(LicenseStatus.EXPIRED);
    expect(license.current().edition).toBe(LicenseEdition.FREE);
  });

  it("another server instance picks up the stored key on its next check", async () => {
    const other = await createTestApp({
      override: (b) => b.overrideProvider(VENDOR_PUBLIC_KEY).useValue(vendor.publicKey),
    });
    try {
      other.get<Env>(ENV).LICENSE_FILE = undefined;
      await put(admin.cookie, await sign({ ...PAID, exp: inOneYear() })).expect(200);
      const remote = other.get(LicenseService);
      await remote.load();
      expect(remote.current()).toMatchObject({ edition: LicenseEdition.LICENSED, maxUsers: 25 });
    } finally {
      await other.close();
    }
  });

  it("removing the key returns to the free limits and is audited", async () => {
    await put(admin.cookie, await sign({ ...PAID, exp: inOneYear() })).expect(200);
    await http().delete("/v1/license").set("Cookie", admin.cookie).set(CSRF).expect(204);
    const res = await http().get("/v1/license").set("Cookie", admin.cookie).expect(200);
    expect(res.body).toMatchObject({ edition: "free", status: "missing", source: "none" });
    expect(await kinds()).toContain("license_removed");
  });

  it("refuses to apply or remove while LICENSE_FILE is set", async () => {
    await useLicense({ ...PAID, exp: inOneYear() });
    const res = await put(admin.cookie, await sign({ ...PAID, exp: inOneYear() })).expect(409);
    expect(res.body).toMatchObject({ error: "license_from_file" });
    await http().delete("/v1/license").set("Cookie", admin.cookie).set(CSRF).expect(409);
    const view = await http().get("/v1/license").set("Cookie", admin.cookie).expect(200);
    expect(view.body).toMatchObject({ source: "file", status: "valid" });
  });
});

describe("license expiry", () => {
  const notices = () => prisma.licenseNotice.findMany();

  it("keeps full limits for 14 days after expiry, without notices", async () => {
    const license = await useLicense({ ...PAID, exp: nowSec() - 86_400 });
    expect(license.currentStatus()).toBe(LicenseStatus.GRACE);
    expect(license.current().maxUsers).toBe(25);
    const res = await http().get("/v1/license").set("Cookie", admin.cookie).expect(200);
    expect(res.body).toMatchObject({ edition: "licensed", status: "grace" });
    expect(Date.parse(res.body.graceEndsAt) - Date.parse(res.body.expiresAt)).toBe(14 * 86_400_000);
    expect(await notices()).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });

  it("emails admins once at the closest warning point, across reloads and instances", async () => {
    await signedIn(prisma, orgId, UserRole.MEMBER);
    await useLicense({ ...PAID, exp: nowSec() + 5 * 86_400 });
    const license = app.get(LicenseService);
    await license.load();
    const other = await createTestApp({
      override: (b) => b.overrideProvider(VENDOR_PUBLIC_KEY).useValue(vendor.publicKey),
    });
    try {
      other.get<Env>(ENV).LICENSE_FILE = app.get<Env>(ENV).LICENSE_FILE;
      await other.get(LicenseService).load();
    } finally {
      await other.close();
    }
    expect((await notices()).map((n) => n.kind)).toEqual(["expires_in_7_days"]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: admin.user.email });
    expect(mail.sent[0]?.subject).toContain("in 5 days");
  });

  it("records the end of the grace period once in the audit log and emails admins", async () => {
    const license = await useLicense({ ...PAID, exp: pastGrace() });
    await license.load();
    expect(license.currentStatus()).toBe(LicenseStatus.EXPIRED);
    const expired = await prisma.auditEntry.findMany({ where: { kind: "license_expired" } });
    expect(expired).toHaveLength(1);
    expect(mail.sent.map((m) => m.subject)).toEqual(["Your Intentlock license has expired"]);
  });

  it("a renewed license starts its own warnings", async () => {
    await useLicense({ ...PAID, exp: nowSec() + 20 * 86_400 });
    await useLicense({ ...PAID, exp: nowSec() + 25 * 86_400 });
    expect(await notices()).toHaveLength(2);
    expect(mail.sent).toHaveLength(2);
  });
});
