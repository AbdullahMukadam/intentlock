import { existsSync, readFileSync } from "node:fs";

import {
  type AuditEntryBody,
  BlockReason,
  type BundleClaims,
  check,
  GENESIS,
  hashEntry,
  parsePolicy,
  Plan,
  planHash,
  policyHash,
  type PolicySet,
  type ToolCall,
  Verdict,
} from "@intentlock/core";
import { PrismaPg } from "@prisma/adapter-pg";

import { createAgent } from "../src/agents/utils/create-agent.util.js";
import { AuditKind } from "../src/audit/enums/audit-kind.enum.js";
import { AuditOrigin } from "../src/audit/enums/audit-origin.enum.js";
import { AuditVerdict } from "../src/audit/enums/audit-verdict.enum.js";
import { hashPassword } from "../src/auth/utils/password.util.js";
import { toJson } from "../src/common/utils/to-json.util.js";
import { ulid } from "../src/common/utils/ulid.util.js";
import { loadEnv } from "../src/config/env.schema.js";
import { HoldStatus, PlanStatus, Prisma, PrismaClient } from "../src/generated/prisma/client.js";
import { orgDb } from "../src/org/utils/org-db.util.js";
import { UserRole } from "../src/users/enums/user-role.enum.js";

if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const RUNS = 900;
const DAYS = 7;
const HOUR_MS = 3_600_000;
const HOLD_TIMEOUT_S = 86_400;

const POLICY = `version: 1
default: block
rules:
  - id: no-destructive
    match: { tool: [github_delete_repo, github_add_collaborator, github_close_issue, shell_exec] }
    decision: block
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver, admin] }
    timeoutSeconds: ${HOLD_TIMEOUT_S}
  - id: hold-merges
    match: { tool: github_merge_pr }
    decision: hold
    approvers: { roles: [admin] }
    timeoutSeconds: ${HOLD_TIMEOUT_S}
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

const AGENTS = [
  {
    name: "github-assistant",
    goal: "Review open pull requests",
    tools: [
      "github_list_prs",
      "github_get_pr",
      "github_get_file",
      "github_search_code",
      "github_merge_pr",
    ],
  },
  {
    name: "tristack-triage",
    goal: "Triage new issues",
    tools: [
      "github_get_issue",
      "github_list_labels",
      "github_search_issues",
      "github_add_label",
      "github_post_comment",
    ],
  },
  {
    name: "support-assistant",
    goal: "Answer a support question",
    tools: ["github_search_issues", "github_get_issue", "github_post_comment"],
  },
];
const ATTACKS = [
  "github_delete_repo",
  "github_add_collaborator",
  "github_close_issue",
  "shell_exec",
  "github_get_file",
];

const EXTRA_USERS = [
  { email: "triage-bot@acme-demo.dev", role: UserRole.MEMBER, groups: ["bots"], label: "bot" },
  { email: "oncall@acme-demo.dev", role: UserRole.APPROVER, groups: ["oncall"], label: null },
];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

function workdayTime(now: number) {
  for (;;) {
    const t = now - Math.random() * DAYS * 24 * HOUR_MS;
    const hour = new Date(t).getUTCHours();
    const weight = hour >= 8 && hour <= 18 ? 1 : 0.25;
    if (Math.random() < weight) return t;
  }
}

function demoPasswords(): Map<string, string> {
  try {
    const lines = readFileSync("../../.env.demo-users", "utf8").split(/\r?\n/);
    return new Map(
      lines
        .filter((l) => l.includes("@") && !l.startsWith("#"))
        .map((l) => l.trim().split(/\s+/) as [string, string]),
    );
  } catch {
    return new Map();
  }
}

type Event = { at: number; entry: Omit<AuditEntryBody, "seq" | "at" | "prevHash" | "orgId"> };

function audit(at: number, fields: Partial<Event["entry"]> & Pick<Event["entry"], "kind">): Event {
  return {
    at,
    entry: {
      origin: AuditOrigin.SERVER,
      actor: null,
      user: null,
      planId: null,
      agentId: null,
      tool: null,
      verdict: null,
      ruleId: null,
      policyVersion: null,
      clientSeq: null,
      clientAt: null,
      clientHash: null,
      flagged: null,
      payload: {},
      ...fields,
    },
  };
}

const env = loadEnv();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

try {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("Run `pnpm seed` first.");
  if ((await prisma.plan.count()) > 0)
    throw new Error("Traffic already seeded; reset the database first.");
  const orgId = org.id;
  const db = orgDb(prisma, orgId);
  const now = Date.now();

  const passwords = demoPasswords();
  for (const u of EXTRA_USERS) {
    await db.user.create({ data: { orgId, ...u } });
  }
  for (const [email, password] of passwords) {
    await db.user.updateMany({
      where: { email },
      data: { passwordHash: await hashPassword(password) },
    });
  }
  const users = await db.user.findMany();
  const admin = users.find((u) => u.role === UserRole.ADMIN)!;
  const approvers = users.filter((u) => u.role === UserRole.APPROVER);
  const requesters = users.filter((u) => u.role === UserRole.MEMBER);

  const parsed = parsePolicy(POLICY);
  if (!parsed.ok) throw new Error("demo policy does not parse");
  const compiled: PolicySet = parsed.policy;
  const polHash = await policyHash(compiled);

  const events: Event[] = [];
  const agents = [];
  for (const spec of AGENTS) {
    const agent =
      (await db.agent.findFirst({ where: { name: spec.name } })) ??
      (await createAgent(db, orgId, { name: spec.name, createdBy: admin.id }));
    const set = await db.policySet.findFirstOrThrow({ where: { agentId: agent.id } });
    await db.policyVersion.create({
      data: {
        orgId,
        policySetId: set.id,
        version: 2,
        source: POLICY,
        compiled: toJson(compiled),
        hash: polHash,
        message: "Demo policy",
        authorId: admin.id,
        createdAt: new Date(now - DAYS * 24 * HOUR_MS - HOUR_MS),
      },
    });
    await db.policySet.update({ where: { id: set.id }, data: { activeVersion: 2 } });
    events.push(
      audit(now - DAYS * 24 * HOUR_MS - HOUR_MS, {
        kind: AuditKind.POLICY_PUBLISHED,
        actor: admin.id,
        agentId: agent.id,
        policyVersion: 2,
        payload: { version: 2, hash: polHash, message: "Demo policy" },
      }),
    );
    agents.push({ ...spec, id: agent.id });
  }

  const plans: Prisma.PlanCreateManyInput[] = [];
  const holds: Prisma.HoldCreateManyInput[] = [];
  for (const start of Array.from({ length: RUNS }, () => workdayTime(now)).sort((a, b) => a - b)) {
    const agent = pick(agents);
    const requester = pick(requesters);
    const planId = ulid(start);
    const steps = agent.tools.filter(() => Math.random() < 0.8).map((tool) => ({ tool }));
    if (steps.length === 0) steps.push({ tool: agent.tools[0]! });
    const plan = Plan.parse({ version: 1, goal: agent.goal, user: requester.email, steps });
    const hash = await planHash(plan);
    plans.push({
      id: planId,
      orgId,
      agentId: agent.id,
      policyVersion: 2,
      planHash: hash,
      user: requester.email,
      goal: plan.goal,
      body: toJson(plan),
      status: start > now - HOUR_MS ? PlanStatus.ACTIVE : PlanStatus.COMPLETED,
      expiresAt: new Date(start + HOUR_MS),
      createdAt: new Date(start),
    });
    events.push(
      audit(start, {
        kind: AuditKind.PLAN_SIGNED,
        actor: agent.id,
        agentId: agent.id,
        user: requester.email,
        planId,
        policyVersion: 2,
        payload: { planHash: hash, policyHash: polHash, goal: plan.goal, steps: steps.length },
      }),
    );
    const bundle: BundleClaims = {
      iss: "intentlock",
      sub: requester.email,
      jti: planId,
      iat: Math.floor(start / 1000),
      exp: Math.floor(start / 1000) + 3600,
      ph: hash,
      plan,
      agent: agent.id,
      pol: compiled,
      polv: 2,
      polh: polHash,
      role: requester.role,
      groups: requester.groups,
      org: orgId,
    };
    const calls = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < calls; i++) {
      const at = start + (i + 1) * (5_000 + Math.random() * 40_000);
      const tool = Math.random() < 0.12 ? pick(ATTACKS) : pick(steps).tool;
      const call: ToolCall = {
        tool,
        args: { repo: "acme/web", n: 1 + Math.floor(Math.random() * 400) },
        callId: ulid(at),
      };
      const decision = check(
        bundle,
        call,
        steps.map(() => 0),
      );
      let holdId: string | undefined;
      if (decision.verdict === Verdict.HOLD) {
        holdId = ulid(at);
        const recent = at > now - 20 * HOUR_MS;
        const roll = Math.random();
        const status =
          recent && roll < 0.5
            ? HoldStatus.PENDING
            : roll < 0.65
              ? HoldStatus.APPROVED
              : roll < 0.85
                ? HoldStatus.REJECTED
                : HoldStatus.EXPIRED;
        const resolvedAt =
          status === HoldStatus.PENDING
            ? null
            : status === HoldStatus.EXPIRED
              ? at + HOLD_TIMEOUT_S * 1000
              : at + (2 + Math.random() * 88) * 60_000;
        const approver = decision.ruleId === "hold-merges" ? admin : pick(approvers);
        const resolver =
          status === HoldStatus.APPROVED || status === HoldStatus.REJECTED ? approver : null;
        const visible = resolvedAt === null || resolvedAt < now;
        holds.push({
          id: holdId,
          orgId,
          planId,
          agentId: agent.id,
          callId: call.callId,
          tool,
          args: toJson(call.args),
          user: requester.email,
          ruleId: decision.ruleId,
          approvers: toJson(decision.approvers),
          status: visible ? status : HoldStatus.PENDING,
          resolvedBy: visible ? (resolver?.id ?? null) : null,
          note: visible && status === HoldStatus.REJECTED ? "Not this time" : null,
          createdAt: new Date(at),
          expiresAt: new Date(at + HOLD_TIMEOUT_S * 1000),
          resolvedAt: visible && resolvedAt !== null ? new Date(resolvedAt) : null,
        });
        if (visible && resolvedAt !== null) {
          events.push(
            audit(resolvedAt, {
              kind: AuditKind.HOLD_RESOLVED,
              actor: resolver?.id ?? null,
              user: requester.email,
              planId,
              agentId: agent.id,
              tool,
              verdict:
                status === HoldStatus.APPROVED
                  ? AuditVerdict.APPROVED
                  : status === HoldStatus.REJECTED
                    ? AuditVerdict.REJECTED
                    : AuditVerdict.EXPIRED,
              ruleId: decision.ruleId,
              payload: resolver
                ? {
                    holdId,
                    note: status === HoldStatus.REJECTED ? "Not this time" : null,
                    approver: resolver.email,
                  }
                : { holdId },
            }),
          );
        }
      }
      const inPlan = !(
        decision.verdict === Verdict.BLOCK && decision.reason === BlockReason.NOT_IN_PLAN
      );
      events.push(
        audit(at, {
          kind: AuditKind.CHECK,
          actor: agent.id,
          agentId: agent.id,
          user: requester.email,
          planId,
          tool,
          verdict: decision.verdict,
          ruleId: decision.ruleId,
          policyVersion: 2,
          payload: toJson({
            call,
            inPlan,
            decision: holdId ? { ...decision, holdId } : decision,
          }) as AuditEntryBody["payload"],
        }),
      );
    }
  }

  await prisma.plan.createMany({ data: plans });
  await prisma.hold.createMany({ data: holds });

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7406211)`;
      const [head] = await tx.$queryRaw<{ seq: number; hash: string }[]>`
        SELECT seq, hash FROM "AuditEntry" ORDER BY seq DESC LIMIT 1`;
      let seq = head?.seq ?? 0;
      let prevHash = head?.hash ?? GENESIS;
      const rows: Prisma.AuditEntryCreateManyInput[] = [];
      for (const e of events.sort((a, b) => a.at - b.at)) {
        seq += 1;
        const body: AuditEntryBody = {
          ...e.entry,
          seq,
          orgId,
          at: new Date(e.at).toISOString(),
          prevHash,
        };
        const hash = await hashEntry(body);
        rows.push({
          ...body,
          at: new Date(e.at),
          clientAt: null,
          payload: e.entry.payload as Prisma.InputJsonValue,
          hash,
        });
        prevHash = hash;
      }
      for (let i = 0; i < rows.length; i += 1000) {
        await tx.auditEntry.createMany({ data: rows.slice(i, i + 1000) });
      }
    },
    { timeout: 120_000 },
  );

  console.log(
    `Seeded ${plans.length} runs, ${events.length} audit entries, ${holds.length} holds ` +
      `(${holds.filter((h) => h.status === HoldStatus.PENDING).length} pending) over ${DAYS} days.`,
  );
  if (passwords.size)
    console.log(`Passwords from .env.demo-users set for ${passwords.size} users.`);
} finally {
  await prisma.$disconnect();
}
