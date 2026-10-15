import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import {
  cookieOf,
  createOrg,
  createTestApp,
  createUser,
  createUserWithPassword,
  CSRF,
  sessionCookie,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const NEW_PASSWORD = "a brand new long passphrase";
const prisma = testPrisma();
let app: INestApplication;
let orgId: string;

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
});

const http = () => request(app.getHttpServer());
const signIn = (email: string, password: string) =>
  http().post("/v1/auth/login").set(CSRF).set("User-Agent", "vitest").send({ email, password });

describe("account", () => {
  it("shows the profile, sign-in methods and CLI token state without secrets", async () => {
    const { user } = await createUserWithPassword(prisma, orgId);
    const res = await http()
      .get("/v1/account")
      .set("Cookie", await sessionCookie(prisma, user))
      .expect(200);
    expect(res.body).toMatchObject({
      email: user.email,
      hasPassword: true,
      identities: [],
      cliToken: { createdAt: expect.any(String) as string },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Hash/);
  });

  it("changing the password needs the current one and ends the other sessions only", async () => {
    const { user, password } = await createUserWithPassword(prisma, orgId);
    const mine = cookieOf(await signIn(user.email, password).expect(200));
    const other = cookieOf(await signIn(user.email, password).expect(200));
    const change = (body: Record<string, unknown>) =>
      http().post("/v1/account/password").set("Cookie", mine).set(CSRF).send(body);

    const wrong = await change({ currentPassword: "not my password", newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("wrong_password");
    await change({ newPassword: NEW_PASSWORD }).expect(400);
    await change({ currentPassword: password, newPassword: NEW_PASSWORD }).expect(204);

    await http().get("/v1/me").set("Cookie", mine).expect(200);
    await http().get("/v1/me").set("Cookie", other).expect(401);
    await signIn(user.email, password).expect(401);
    await signIn(user.email, NEW_PASSWORD).expect(200);
  });

  it("lets a user without a password set one", async () => {
    const { user } = await createUser(prisma, orgId);
    const cookie = await sessionCookie(prisma, user);
    await http()
      .post("/v1/account/password")
      .set("Cookie", cookie)
      .set(CSRF)
      .send({ newPassword: NEW_PASSWORD })
      .expect(204);
    await signIn(user.email, NEW_PASSWORD).expect(200);
  });

  it("lists own sessions and signs out the others", async () => {
    const { user, password } = await createUserWithPassword(prisma, orgId);
    const { user: someone } = await createUser(prisma, orgId);
    const theirs = await sessionCookie(prisma, someone);
    const mine = cookieOf(await signIn(user.email, password).expect(200));
    const other = cookieOf(await signIn(user.email, password).expect(200));
    const list = await http().get("/v1/account/sessions").set("Cookie", mine).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ userAgent: "vitest" });
    expect(list.body[0]).not.toHaveProperty("id");

    await http().delete("/v1/account/sessions").set("Cookie", mine).set(CSRF).expect(204);
    await http().get("/v1/me").set("Cookie", mine).expect(200);
    await http().get("/v1/me").set("Cookie", other).expect(401);
    await http().get("/v1/me").set("Cookie", theirs).expect(200);
  });

  it("creates a CLI token that signs in, replaces the old one, and can be revoked", async () => {
    const { user, token: old } = await createUser(prisma, orgId);
    const cookie = await sessionCookie(prisma, user);
    const created = await http()
      .post("/v1/account/cli-token")
      .set("Cookie", cookie)
      .set(CSRF)
      .expect(201);
    const login = (token: string) =>
      http().post("/v1/auth/login").set(CSRF).send({ email: user.email, token });
    await login(old).expect(401);
    await login(created.body.token).expect(200);
    await http().delete("/v1/account/cli-token").set("Cookie", cookie).set(CSRF).expect(204);
    await login(created.body.token).expect(401);
    const view = await http().get("/v1/account").set("Cookie", cookie).expect(200);
    expect(view.body.cliToken).toBeNull();
  });

  it("audits every account change in a valid chain", async () => {
    const { user, password } = await createUserWithPassword(prisma, orgId);
    const cookie = await sessionCookie(prisma, user);
    await http()
      .post("/v1/account/password")
      .set("Cookie", cookie)
      .set(CSRF)
      .send({ currentPassword: password, newPassword: NEW_PASSWORD })
      .expect(204);
    await http().delete("/v1/account/sessions").set("Cookie", cookie).set(CSRF).expect(204);
    await http().post("/v1/account/cli-token").set("Cookie", cookie).set(CSRF).expect(201);
    await http().delete("/v1/account/cli-token").set("Cookie", cookie).set(CSRF).expect(204);
    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([
      AuditKind.PASSWORD_CHANGED,
      AuditKind.SESSIONS_REVOKED,
      AuditKind.CLI_TOKEN_CREATED,
      AuditKind.CLI_TOKEN_REVOKED,
    ]);
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
  });
});
