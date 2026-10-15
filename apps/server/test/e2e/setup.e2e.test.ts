import { type INestApplication, Logger } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { sha256Hex } from "../../src/common/utils/crypto.util.js";
import { ENV } from "../../src/config/config.module.js";
import { loadEnv } from "../../src/config/env.schema.js";
import { bootstrapOrg } from "../../src/org/utils/bootstrap-org.util.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import { cookieOf, createTestApp, CSRF, PASSWORD, verifyAuditChain } from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const prisma = testPrisma();
let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(() => resetDb(prisma));

const http = () => request(app.getHttpServer());

async function freshCode() {
  return (await bootstrapOrg(prisma, { orgName: "Acme" }))!.setupCode;
}

function setup(body: Record<string, unknown>) {
  return http().post("/v1/setup").set(CSRF).send(body);
}

describe("boot", () => {
  it("creates one organization when two instances boot together; the stored code is one of theirs", async () => {
    const results = await Promise.all([
      bootstrapOrg(prisma, { orgName: "Acme" }),
      bootstrapOrg(prisma, { orgName: "Acme" }),
    ]);
    expect(await prisma.organization.count()).toBe(1);
    const org = await prisma.organization.findFirstOrThrow();
    expect(results.map((r) => sha256Hex(r!.setupCode))).toContain(org.setupCodeHash);
  });

  it("issues a new code on every boot until setup is done, then none", async () => {
    const first = await freshCode();
    const second = await freshCode();
    await setup({ code: first, email: "boss@acme.dev", password: PASSWORD }).expect(401);
    await setup({ code: second, email: "boss@acme.dev", password: PASSWORD }).expect(201);
    expect(await bootstrapOrg(prisma, { orgName: "Acme" })).toBeNull();
  });
});

describe("POST /v1/setup", () => {
  it("creates the first admin, signs them in, renames the org, then answers 409 forever", async () => {
    const code = await freshCode();
    await http().get("/v1/setup/status").expect(200, { setupRequired: true });

    const res = await setup({
      code,
      email: "Boss@Acme.dev",
      password: PASSWORD,
      orgName: "Acme Inc",
    }).expect(201);
    expect(res.body).toEqual({
      user: { email: "boss@acme.dev", role: UserRole.ADMIN, groups: [] },
    });
    const me = await http().get("/v1/me").set("Cookie", cookieOf(res)).expect(200);
    expect(me.body.role).toBe(UserRole.ADMIN);
    const org = await prisma.organization.findFirstOrThrow();
    expect(org).toMatchObject({ name: "Acme Inc", setupCodeHash: null });

    await http().get("/v1/setup/status").expect(200, { setupRequired: false });
    const again = await setup({ code, email: "evil@acme.dev", password: PASSWORD }).expect(409);
    expect(again.body.error).toBe("setup_complete");
    await setup({ code: "wrong", email: "evil@acme.dev", password: PASSWORD }).expect(409);
    await http()
      .post("/v1/auth/login")
      .set(CSRF)
      .send({ email: "boss@acme.dev", password: PASSWORD })
      .expect(200);
    expect(await prisma.user.count()).toBe(1);
  });

  it("rejects a wrong setup code, audits it and creates nobody", async () => {
    await freshCode();
    const res = await setup({ code: "not-the-code", email: "boss@acme.dev", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_setup_code");
    expect(await prisma.user.count()).toBe(0);
    const kinds = (await prisma.auditEntry.findMany()).map((e) => e.kind);
    expect(kinds).toEqual([AuditKind.SETUP_FAILED]);
  });

  it("enforces the password rules", async () => {
    const code = await freshCode();
    const short = await setup({ code, email: "boss@acme.dev", password: "short" }).expect(400);
    expect(short.body.error).toBe("validation_failed");
    const weak = await setup({ code, email: "boss@acme.dev", password: "boss-is-the-best" });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toBe("password_too_weak");
    expect(await prisma.user.count()).toBe(0);
  });

  it("audits setup and the first sign-in in a valid chain", async () => {
    const code = await freshCode();
    await setup({ code, email: "boss@acme.dev", password: PASSWORD }).expect(201);
    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([AuditKind.SETUP_COMPLETED, AuditKind.AUTH_LOGIN]);
    expect(await verifyAuditChain(prisma)).toEqual({ ok: true, count: 2 });
  });
});

describe("setup with INTENTLOCK_DEMO=1", () => {
  let demoApp: INestApplication;

  beforeAll(async () => {
    demoApp = await createTestApp({
      override: (b) => b.overrideProvider(ENV).useValue({ ...loadEnv(), INTENTLOCK_DEMO: true }),
    });
  });
  afterAll(() => demoApp.close());

  it("creates an approver, a member and an intern whose printed passwords sign in", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const code = await freshCode();
    await request(demoApp.getHttpServer())
      .post("/v1/setup")
      .set(CSRF)
      .send({ code, email: "boss@acme.dev", password: PASSWORD })
      .expect(201);
    const users = await prisma.user.findMany({
      select: { email: true, role: true, groups: true },
      orderBy: { email: "asc" },
    });
    expect(users).toEqual([
      { email: "approver@acme.dev", role: UserRole.APPROVER, groups: [] },
      { email: "boss@acme.dev", role: UserRole.ADMIN, groups: [] },
      { email: "intern@acme.dev", role: UserRole.MEMBER, groups: ["intern"] },
      { email: "member@acme.dev", role: UserRole.MEMBER, groups: [] },
    ]);
    const line = warn.mock.calls
      .map((c) => String(c[0]))
      .find((m) => m.includes("member@acme.dev"));
    warn.mockRestore();
    const password = line!.split(": ").pop()!;
    await request(demoApp.getHttpServer())
      .post("/v1/auth/login")
      .set(CSRF)
      .send({ email: "member@acme.dev", password })
      .expect(200);
  });
});
