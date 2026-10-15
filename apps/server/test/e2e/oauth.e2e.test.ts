import type { INestApplication } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { OAUTH_PROVIDERS } from "../../src/auth/oauth/constants/oauth.constants.js";
import { loadEnv } from "../../src/config/env.schema.js";
import { MailService } from "../../src/mail/mail.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import { type FakeAccount, startFakeOAuth } from "../fixtures/fake-oauth.js";
import {
  createOrg,
  createUser,
  createUserWithPassword,
  createTestApp,
  CSRF,
  FakeMail,
  linkToken,
  ResettableThrottlerStorage,
  sessionCookie,
  signedIn,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const PUBLIC_URL = loadEnv().PUBLIC_URL;
const prisma = testPrisma();
const limits = new ResettableThrottlerStorage();
let fake: Awaited<ReturnType<typeof startFakeOAuth>>;
let app: INestApplication;
let orgId: string;

beforeAll(async () => {
  fake = await startFakeOAuth();
  app = await createTestApp({
    override: (b) =>
      b
        .overrideProvider(OAUTH_PROVIDERS)
        .useValue(fake.providers)
        .overrideProvider(MailService)
        .useValue(new FakeMail())
        .overrideProvider(ThrottlerStorage)
        .useValue(limits),
  });
});
afterAll(async () => {
  await app.close();
  await fake.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  limits.reset();
  await resetDb(prisma);
  orgId = await createOrg(prisma);
});

const http = () => request(app.getHttpServer());
const account = (email: string, subject = "1001", verified = true): FakeAccount => ({
  email,
  subject,
  verified,
});

function cookiePair(header: string | string[] | undefined, name: string): string | undefined {
  return [header ?? []]
    .flat()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(";")[0];
}

async function start(provider: string, query = "", cookie?: string) {
  const req = http().get(`/v1/auth/oauth/${provider}${query}`);
  if (cookie) void req.set("Cookie", cookie);
  const res = await req.expect(302);
  return {
    location: res.headers.location as string,
    state: cookiePair(res.get("set-cookie"), "il_oauth")!,
  };
}

async function callback(provider: string, query: Record<string, string>, cookies: string[]) {
  const res = await http()
    .get(`/v1/auth/oauth/${provider}/callback`)
    .query(query)
    .set("Cookie", cookies.join("; "))
    .expect(302);
  return {
    location: res.headers.location as string,
    session: cookiePair(res.get("set-cookie"), "il_session"),
  };
}

async function flow(
  provider: "google" | "github",
  who: FakeAccount,
  query = "",
  extra: string[] = [],
) {
  const s = await start(provider, query);
  const { code, state } = fake.authorize(s.location, who);
  return callback(provider, { code, state }, [s.state, ...extra]);
}

describe("OAuth start", () => {
  it("redirects to the provider with PKCE (S256), state, and a callback under PUBLIC_URL/api", async () => {
    const { location, state } = await start("google");
    const url = new URL(location);
    expect(url.pathname).toBe("/google/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${PUBLIC_URL}/api/v1/auth/oauth/google/callback`,
    );
    expect(state).toMatch(/^il_oauth=/);
  });

  it("lists both providers as enabled and rejects unknown ones", async () => {
    const methods = await http().get("/v1/auth/methods").expect(200);
    expect(methods.body).toMatchObject({ google: true, github: true });
    await http().get("/v1/auth/oauth/gitlab").expect(400);
    await http().get("/v1/auth/oauth/github?mode=invite").expect(400);
  });
});

describe("OAuth sign-in", () => {
  it("signs in an existing user by verified Google email, links the identity, then matches by subject", async () => {
    const { user } = await createUser(prisma, orgId, UserRole.APPROVER);
    const first = await flow("google", account(user.email.toUpperCase(), "g-1"));
    expect(first.location).toBe(`${PUBLIC_URL}/`);
    const me = await http().get("/v1/me").set("Cookie", first.session!).expect(200);
    expect(me.body.email).toBe(user.email);
    const identity = await prisma.identity.findFirstOrThrow();
    expect(identity).toMatchObject({ userId: user.id, provider: "google", subject: "g-1" });

    const renamed = await flow("google", account("someone-else@gmail.test", "g-1"));
    expect(renamed.session).toBeTruthy();
    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([AuditKind.IDENTITY_LINKED, AuditKind.AUTH_LOGIN, AuditKind.AUTH_LOGIN]);
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
  });

  it("signs in with GitHub using the primary verified email", async () => {
    const { user } = await createUser(prisma, orgId);
    const res = await flow("github", account(user.email, "77"));
    expect(res.location).toBe(`${PUBLIC_URL}/`);
    await http().get("/v1/me").set("Cookie", res.session!).expect(200);
    const login = await prisma.auditEntry.findFirstOrThrow({
      where: { kind: AuditKind.AUTH_LOGIN },
    });
    expect(login.payload).toMatchObject({ method: "github" });
  });

  it("never creates an account for an unknown email", async () => {
    const res = await flow("google", account("stranger@gmail.test"));
    expect(res.location).toBe(`${PUBLIC_URL}/login?error=no_account`);
    expect(res.session).toBeUndefined();
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.auditEntry.count({ where: { kind: AuditKind.AUTH_LOGIN_FAILED } })).toBe(1);
  });

  it("refuses an unverified email on both providers", async () => {
    const { user } = await createUser(prisma, orgId);
    for (const provider of ["google", "github"] as const) {
      const res = await flow(provider, account(user.email, "5", false));
      expect(res.location).toBe(`${PUBLIC_URL}/login?error=email_not_verified`);
      expect(res.session).toBeUndefined();
    }
    expect(await prisma.identity.count()).toBe(0);
  });

  it("refuses a disabled user, by email and by an already linked identity", async () => {
    const { user } = await createUser(prisma, orgId);
    await flow("github", account(user.email, "9")).then((r) => expect(r.session).toBeTruthy());
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    const res = await flow("github", account(user.email, "9"));
    expect(res.location).toBe(`${PUBLIC_URL}/login?error=no_account`);
    expect(res.session).toBeUndefined();
  });

  it("fails closed on a wrong state, a missing or tampered state cookie, and a provider mismatch", async () => {
    const { user } = await createUser(prisma, orgId);
    const failed = `${PUBLIC_URL}/login?error=oauth_failed`;
    const s = await start("google");
    const { code, state } = fake.authorize(s.location, account(user.email));
    expect((await callback("google", { code, state: "wrong" }, [s.state])).location).toBe(failed);
    expect((await callback("google", { code, state }, [])).location).toBe(failed);
    const [name, jws] = s.state.split("=") as [string, string];
    const [h, p, sig] = jws.split(".") as [string, string, string];
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), mode: "link" }),
    ).toString("base64url");
    expect(
      (await callback("google", { code, state }, [`${name}=${h}.${forged}.${sig}`])).location,
    ).toBe(failed);
    expect((await callback("github", { code, state }, [s.state])).location).toBe(failed);
    expect(await prisma.session.count()).toBe(0);
  });

  it("refuses a replayed authorization code", async () => {
    const { user } = await createUser(prisma, orgId);
    const s = await start("github");
    const { code, state } = fake.authorize(s.location, account(user.email, "3"));
    const first = await callback("github", { code, state }, [s.state]);
    expect(first.session).toBeTruthy();
    const replay = await callback("github", { code, state }, [s.state]);
    expect(replay.location).toBe(`${PUBLIC_URL}/login?error=oauth_failed`);
    expect(replay.session).toBeUndefined();
  });

  it("reports a cancelled consent screen", async () => {
    const s = await start("google");
    const { state } = fake.authorize(s.location, account("x@test.dev"));
    const res = await callback("google", { error: "access_denied", state }, [s.state]);
    expect(res.location).toBe(`${PUBLIC_URL}/login?error=oauth_cancelled`);
  });
});

describe("accepting an invite with OAuth", () => {
  async function invite(email: string) {
    const { cookie } = await signedIn(prisma, orgId, UserRole.ADMIN);
    const res = await http()
      .post("/v1/invites")
      .set("Cookie", cookie)
      .set(CSRF)
      .send({ email, role: UserRole.APPROVER, groups: ["oncall"] })
      .expect(201);
    return linkToken(res.body.link);
  }

  it("creates the user with the invited role and groups and links the identity", async () => {
    const token = await invite("new@test.dev");
    const res = await flow(
      "github",
      account("new@test.dev", "500"),
      `?mode=invite&invite=${token}`,
    );
    expect(res.location).toBe(`${PUBLIC_URL}/`);
    const me = await http().get("/v1/me").set("Cookie", res.session!).expect(200);
    expect(me.body).toEqual({ email: "new@test.dev", role: UserRole.APPROVER, groups: ["oncall"] });
    const user = await prisma.user.findFirstOrThrow({
      where: { email: "new@test.dev" },
      include: { identities: true },
    });
    expect(user.passwordHash).toBeNull();
    expect(user.identities.map((i) => i.provider)).toEqual(["github"]);
    const again = await flow(
      "github",
      account("new@test.dev", "500"),
      `?mode=invite&invite=${token}`,
    );
    expect(again.location).toBe(`${PUBLIC_URL}/login?error=invite_invalid`);
  });

  it("refuses a provider email that is not the invited one", async () => {
    const token = await invite("new@test.dev");
    const res = await flow("google", account("other@test.dev"), `?mode=invite&invite=${token}`);
    expect(res.location).toBe(`${PUBLIC_URL}/login?error=invite_email_mismatch`);
    expect(await prisma.user.count({ where: { email: "new@test.dev" } })).toBe(0);
  });
});

describe("linking and unlinking providers", () => {
  it("links GitHub to the signed-in user, signs in with it, and unlinks it", async () => {
    const { user } = await createUserWithPassword(prisma, orgId);
    const cookie = await sessionCookie(prisma, user);
    const res = await flow("github", account("personal@elsewhere.dev", "321"), "?mode=link", [
      cookie,
    ]);
    expect(res.location).toBe(`${PUBLIC_URL}/account?linked=github`);
    const signIn = await flow("github", account("personal@elsewhere.dev", "321"));
    expect(signIn.session).toBeTruthy();
    const view = await http().get("/v1/account").set("Cookie", cookie).expect(200);
    expect(view.body.identities).toMatchObject([
      { provider: "github", email: "personal@elsewhere.dev" },
    ]);
    await http()
      .delete("/v1/account/identities/github")
      .set("Cookie", cookie)
      .set(CSRF)
      .expect(204);
    const after = await flow("github", account("personal@elsewhere.dev", "321"));
    expect(after.location).toBe(`${PUBLIC_URL}/login?error=no_account`);
  });

  it("refuses to link an identity that belongs to someone else, or without a session", async () => {
    const { user: owner } = await createUser(prisma, orgId);
    await flow("google", account(owner.email, "g-9"));
    const { user } = await createUserWithPassword(prisma, orgId);
    const res = await flow("google", account(owner.email, "g-9"), "?mode=link", [
      await sessionCookie(prisma, user),
    ]);
    expect(res.location).toBe(`${PUBLIC_URL}/account?error=identity_in_use`);
    const anon = await flow("google", account(owner.email, "g-9"), "?mode=link");
    expect(anon.location).toBe(`${PUBLIC_URL}/login?error=not_signed_in`);
  });

  it("never removes the last sign-in method", async () => {
    const { user } = await createUser(prisma, orgId);
    const res = await flow("google", account(user.email, "g-2"));
    const refused = await http()
      .delete("/v1/account/identities/google")
      .set("Cookie", res.session!)
      .set(CSRF)
      .expect(409);
    expect(refused.body.error).toBe("last_sign_in_method");
    await http()
      .delete("/v1/account/identities/github")
      .set("Cookie", res.session!)
      .set(CSRF)
      .expect(404);
  });
});
