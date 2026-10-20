import { Logger } from "@nestjs/common";

import type { AuditService } from "../../../src/audit/audit.service.js";
import { AuditKind } from "../../../src/audit/enums/audit-kind.enum.js";
import { loadEnv } from "../../../src/config/env.schema.js";
import type { Hold } from "../../../src/generated/prisma/client.js";
import { HoldNotifier } from "../../../src/holds/hold-notifier.service.js";
import type { MailService } from "../../../src/mail/mail.service.js";
import type { PrismaService } from "../../../src/prisma/prisma.service.js";

const USERS = [
  { email: "admin@acme.dev", role: "admin", holdEmails: true, disabledAt: null },
  { email: "appr@acme.dev", role: "approver", holdEmails: true, disabledAt: null },
  { email: "quiet@acme.dev", role: "admin", holdEmails: false, disabledAt: null },
  { email: "gone@acme.dev", role: "admin", holdEmails: true, disabledAt: new Date() },
  { email: "mem@acme.dev", role: "member", holdEmails: true, disabledAt: null },
  { email: "named@acme.dev", role: "member", holdEmails: true, disabledAt: null },
  { email: "bot@acme.dev", role: "admin", holdEmails: true, disabledAt: null },
];

const HOLD = {
  id: "hold_1",
  orgId: "org_1",
  agentId: "agent_1",
  planId: "plan_1",
  user: "bot@acme.dev",
  callId: "c1",
  tool: "github_post_comment",
  args: { body: "hello" },
  ruleId: "hold-comments",
  approvers: {
    roles: ["admin", "approver"],
    emails: ["named@acme.dev", "outsider@x.dev"],
    self: false,
  },
  expiresAt: new Date("2026-10-20T10:30:00Z"),
} as unknown as Hold;

const ONLY_NAMED = {
  ...HOLD,
  approvers: { roles: [], emails: ["named@acme.dev"], self: false },
} as Hold;

const SMTP = { SMTP_URL: "smtp://127.0.0.1:2525", SMTP_FROM: "il@acme.dev" };
const WEBHOOK = { HOLD_WEBHOOK_URL: "https://hooks.example.com/x" };

function fakePrisma() {
  const db = {
    $extends: () => db,
    agent: { findFirst: async () => ({ name: "tristack-triage" }) },
    user: {
      findMany: async ({ where }: { where: { holdEmails: boolean; disabledAt: null } }) =>
        USERS.filter((u) => u.holdEmails === where.holdEmails && u.disabledAt === where.disabledAt),
    },
  };
  return db as unknown as PrismaService;
}

function setup(vars: Record<string, string>, results: boolean[] = []) {
  const env = loadEnv({
    DATABASE_URL: "postgresql://x@localhost/db",
    PUBLIC_URL: "https://il.acme.dev",
    ...vars,
  });
  const sent: string[] = [];
  const mail = {
    enabled: Boolean(env.SMTP_URL),
    send: vi.fn(async (to: string) => {
      sent.push(to);
      return results.shift() ?? true;
    }),
  } as unknown as MailService;
  const append = vi.fn(async () => []);
  const audit = { append } as unknown as AuditService;
  return { notifier: new HoldNotifier(fakePrisma(), audit, mail, env), sent, mail, append };
}

async function settle(p: Promise<void>) {
  await vi.runAllTimersAsync();
  await p;
}

describe("HoldNotifier", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("emails active approvers from the rule, skipping opt-outs, outsiders and the requester", async () => {
    const { notifier, sent, append } = setup(SMTP);
    await settle(notifier.send(HOLD));
    expect(sent.sort()).toEqual(["admin@acme.dev", "appr@acme.dev", "named@acme.dev"]);
    expect(append).not.toHaveBeenCalled();
  });

  it("includes the requester when the rule allows self approval", async () => {
    const { notifier, sent } = setup(SMTP);
    await settle(
      notifier.send({ ...HOLD, approvers: { roles: [], emails: [], self: true } } as Hold),
    );
    expect(sent).toEqual(["bot@acme.dev"]);
  });

  it("sends nothing without SMTP or a webhook", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { notifier, mail } = setup({});
    await settle(notifier.send(HOLD));
    expect(mail.send).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a failed email once and audits it when the retry fails too", async () => {
    const { notifier, sent, append } = setup(SMTP, [false, false]);
    await settle(notifier.send(ONLY_NAMED));
    expect(sent).toEqual(["named@acme.dev", "named@acme.dev"]);
    expect(append).toHaveBeenCalledWith("org_1", [
      expect.objectContaining({
        kind: AuditKind.HOLD_NOTIFY_FAILED,
        payload: { holdId: "hold_1", channel: "email", to: "named@acme.dev" },
      }),
    ]);
  });

  it("does not audit when the retry succeeds", async () => {
    const { notifier, sent, append } = setup(SMTP, [false, true]);
    await settle(notifier.send(ONLY_NAMED));
    expect(sent).toHaveLength(2);
    expect(append).not.toHaveBeenCalled();
  });

  it("posts Slack and Discord fields to the webhook with argument names only", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { notifier } = setup(WEBHOOK);
    await settle(notifier.send(HOLD));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { text: string; content: string };
    expect(url).toBe("https://hooks.example.com/x");
    expect(body.text).toBe(body.content);
    expect(body.text).toContain("Argument names: body");
    expect(body.text).not.toContain("hello");
  });

  it("audits a webhook that fails twice", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { notifier, append } = setup(WEBHOOK);
    await settle(notifier.send(HOLD));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenCalledWith("org_1", [
      expect.objectContaining({ payload: { holdId: "hold_1", channel: "webhook", to: null } }),
    ]);
  });

  it("never throws from notify when sending fails", async () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { notifier } = setup(SMTP);
    vi.spyOn(notifier, "send").mockRejectedValue(new Error("db down"));
    expect(() => notifier.notify(HOLD)).not.toThrow();
    await vi.runAllTimersAsync();
    expect(error).toHaveBeenCalled();
  });
});
