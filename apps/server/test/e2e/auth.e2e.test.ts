import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import {
  createOrg,
  createTestApp,
  createUser,
  CSRF,
  sessionCookie,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";
import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";

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

function login(email: string, token: string) {
  return http().post("/v1/auth/login").set(CSRF).send({ email, token });
}

describe("login", () => {
  it("exchanges email + token for an httpOnly SameSite=Lax session cookie", async () => {
    const { user, token } = await createUser(prisma, orgId, UserRole.APPROVER, ["oncall"]);
    const res = await login(user.email.toUpperCase(), token).expect(200);
    expect(res.body).toEqual({
      user: { email: user.email, role: UserRole.APPROVER, groups: ["oncall"] },
    });
    const cookie = res.get("set-cookie")![0]!;
    expect(cookie).toMatch(/^il_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const me = await http().get("/v1/me").set("Cookie", cookie.split(";")[0]!).expect(200);
    expect(me.body).toEqual({ email: user.email, role: UserRole.APPROVER, groups: ["oncall"] });
  });

  it("rejects a wrong token, an unknown email and a disabled user with the same 401", async () => {
    const { user, token } = await createUser(prisma, orgId);
    const wrong = await login(user.email, "nope").expect(401);
    const unknown = await login("ghost@test.dev", token).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    await login(user.email, token).expect(401);
    expect(await prisma.auditEntry.count({ where: { kind: AuditKind.AUTH_LOGIN_FAILED } })).toBe(3);
  });

  it("requires the CSRF header", async () => {
    const { user, token } = await createUser(prisma, orgId);
    await http().post("/v1/auth/login").send({ email: user.email, token }).expect(403);
  });

  it("rate-limits repeated attempts for one email", async () => {
    const { user } = await createUser(prisma, orgId);
    for (let i = 0; i < 5; i++) await login(user.email, "wrong").expect(401);
    await login(user.email, "wrong").expect(429);
  });
});

describe("sessions", () => {
  it("logout ends the session", async () => {
    const { user } = await createUser(prisma, orgId);
    const cookie = await sessionCookie(prisma, user);
    await http().post("/v1/auth/logout").set("Cookie", cookie).set(CSRF).expect(204);
    await http().get("/v1/me").set("Cookie", cookie).expect(401);
  });

  it("rejects an expired session", async () => {
    const { user } = await createUser(prisma, orgId);
    const cookie = await sessionCookie(prisma, user);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await http().get("/v1/me").set("Cookie", cookie).expect(401);
  });

  it("rejects cookie-authenticated mutations without the CSRF header", async () => {
    const { user } = await createUser(prisma, orgId);
    const cookie = await sessionCookie(prisma, user);
    await http().post("/v1/auth/logout").set("Cookie", cookie).expect(403);
  });
});

describe("users (admin only)", () => {
  it("creates a user whose one-time token signs in; duplicates are 409", async () => {
    const { user: admin } = await createUser(prisma, orgId, UserRole.ADMIN);
    const cookie = await sessionCookie(prisma, admin);
    const res = await http()
      .post("/v1/users")
      .set("Cookie", cookie)
      .set(CSRF)
      .send({ email: "New@Test.dev", role: UserRole.APPROVER, groups: ["oncall"] })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: "new@test.dev", role: UserRole.APPROVER });
    expect(res.body.user).not.toHaveProperty("cliTokenHash");
    await login("new@test.dev", res.body.loginToken).expect(200);
    await http()
      .post("/v1/users")
      .set("Cookie", cookie)
      .set(CSRF)
      .send({ email: "new@test.dev", role: UserRole.MEMBER })
      .expect(409);
    const list = await http().get("/v1/users").set("Cookie", cookie).expect(200);
    expect(list.body).toHaveLength(2);
  });

  it("is forbidden to members and approvers", async () => {
    for (const role of [UserRole.MEMBER, UserRole.APPROVER]) {
      const { user } = await createUser(prisma, orgId, role);
      await http()
        .get("/v1/users")
        .set("Cookie", await sessionCookie(prisma, user))
        .expect(403);
    }
  });

  it("disabling a user ends their sessions and blocks sign-in", async () => {
    const { user: admin } = await createUser(prisma, orgId, UserRole.ADMIN);
    const { user, token } = await createUser(prisma, orgId);
    const theirs = await sessionCookie(prisma, user);
    await http()
      .patch(`/v1/users/${user.email}`)
      .set("Cookie", await sessionCookie(prisma, admin))
      .set(CSRF)
      .send({ disabled: true })
      .expect(200);
    await http().get("/v1/me").set("Cookie", theirs).expect(401);
    await login(user.email, token).expect(401);
  });

  it("a disabled user's still-stored session is rejected", async () => {
    const { user } = await createUser(prisma, orgId);
    const cookie = await sessionCookie(prisma, user);
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    await http().get("/v1/me").set("Cookie", cookie).expect(401);
  });

  it("re-issuing a token ends sessions and invalidates the old token", async () => {
    const { user: admin } = await createUser(prisma, orgId, UserRole.ADMIN);
    const { user, token } = await createUser(prisma, orgId);
    const theirs = await sessionCookie(prisma, user);
    const res = await http()
      .post(`/v1/users/${user.email}/token`)
      .set("Cookie", await sessionCookie(prisma, admin))
      .set(CSRF)
      .expect(201);
    await http().get("/v1/me").set("Cookie", theirs).expect(401);
    await login(user.email, token).expect(401);
    await login(user.email, res.body.loginToken).expect(200);
  });

  it("an admin cannot disable or demote themselves", async () => {
    const { user: admin } = await createUser(prisma, orgId, UserRole.ADMIN);
    const cookie = await sessionCookie(prisma, admin);
    for (const body of [{ disabled: true }, { role: UserRole.MEMBER }]) {
      await http()
        .patch(`/v1/users/${admin.email}`)
        .set("Cookie", cookie)
        .set(CSRF)
        .send(body)
        .expect(400);
    }
  });

  it("audits auth and user events in a valid chain", async () => {
    const { user: admin, token } = await createUser(prisma, orgId, UserRole.ADMIN);
    await login(admin.email, token).expect(200);
    await login(admin.email, "wrong").expect(401);
    await http()
      .post("/v1/users")
      .set("Cookie", await sessionCookie(prisma, admin))
      .set(CSRF)
      .send({ email: "a@test.dev", role: UserRole.MEMBER })
      .expect(201);
    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([
      AuditKind.AUTH_LOGIN,
      AuditKind.AUTH_LOGIN_FAILED,
      AuditKind.USER_CREATED,
    ]);
    expect(await verifyAuditChain(prisma)).toEqual({ ok: true, count: 3 });
  });
});
