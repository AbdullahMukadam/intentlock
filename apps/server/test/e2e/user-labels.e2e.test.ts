import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  CSRF,
  planFor,
  publish,
  signedIn,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const POLICY = `version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver] }
    timeoutSeconds: 300
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

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
});

const http = () => request(app.getHttpServer());

function setLabel(cookie: string, email: string, label: unknown) {
  return http()
    .patch(`/v1/users/${encodeURIComponent(email)}`)
    .set("Cookie", cookie)
    .set(CSRF)
    .send({ label });
}

describe("member labels", () => {
  it("lets an admin set and clear a label, audited with the old value", async () => {
    await setLabel(admin.cookie, member.user.email, " bot ")
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ label: "bot" }));
    await setLabel(admin.cookie, member.user.email, "")
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ label: null }));
    const entries = await prisma.auditEntry.findMany({
      where: { kind: AuditKind.USER_UPDATED },
      orderBy: { seq: "asc" },
    });
    expect(entries.map((e) => e.payload)).toEqual([
      expect.objectContaining({ email: member.user.email, label: "bot", previousLabel: null }),
      expect.objectContaining({ email: member.user.email, label: null, previousLabel: "bot" }),
    ]);
    await verifyAuditChain(prisma);
  });

  it("is admin only and validated", async () => {
    await setLabel(member.cookie, member.user.email, "bot").expect(403);
    await setLabel(admin.cookie, member.user.email, "<script>").expect(400);
    await setLabel(admin.cookie, member.user.email, "x".repeat(25)).expect(400);
  });

  it("is shown to every member in the team list", async () => {
    await setLabel(admin.cookie, member.user.email, "bot").expect(200);
    const res = await http().get("/v1/users").set("Cookie", member.cookie).expect(200);
    expect(res.body).toContainEqual(
      expect.objectContaining({ email: member.user.email, label: "bot" }),
    );
  });

  it("never changes a decision", async () => {
    const bot = await createAgentWithKey(prisma, orgId);
    await publish(app, bot.agent.id, admin.cookie, POLICY);
    const decide = async (tool: string) => {
      const plan = await http()
        .post("/v1/plans")
        .set(bot.auth)
        .send({
          plan: planFor(member.user.email, [
            { tool: "github_list_issues" },
            { tool: "github_post_comment" },
          ]),
        })
        .expect(201);
      const res = await http()
        .post("/v1/check")
        .set(bot.auth)
        .send({ token: plan.body.token, call: call(tool, {}) })
        .expect(200);
      return { verdict: res.body.verdict as string, ruleId: res.body.ruleId as string | null };
    };
    const tools = ["github_list_issues", "github_post_comment", "github_delete_repo"];
    const before = await Promise.all(tools.map(decide));
    await setLabel(admin.cookie, member.user.email, "bot").expect(200);
    const after = await Promise.all(tools.map(decide));
    expect(after).toEqual(before);
    expect(before.map((d) => d.verdict)).toEqual(["allow", "hold", "block"]);
  });
});
