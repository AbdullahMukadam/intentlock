import { toolset } from "@intentlock/guard";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SupportTool } from "../../../../src/agents/support/enums/support-tool.enum.js";
import { fakeMailbox } from "../../../../src/agents/support/fake-mailbox.js";
import { mailpit, SUPPORT_ADDRESS } from "../../../../src/agents/support/mailbox.js";
import { loadOrders, type Refund } from "../../../../src/agents/support/orders.js";
import { supportTools } from "../../../../src/agents/support/tools.js";

function setup() {
  const fake = fakeMailbox();
  const refunds: Refund[] = [];
  const { impls } = toolset(supportTools(fake.mailbox, loadOrders(), refunds));
  const run = (name: SupportTool, args: Record<string, unknown>) => {
    const impl = impls[name];
    if (!impl) throw new Error(`no impl ${name}`);
    return impl(args);
  };
  return { ...fake, refunds, run };
}

describe("support tools", () => {
  test("mail_list returns the seeded inbox", async () => {
    const t = setup();
    const list = (await t.run(SupportTool.MAIL_LIST, {})) as { from: string }[];
    expect(list.map((m) => m.from)).toContain("dana@example.com");
    expect(list).toHaveLength(4);
  });

  test("mail_reply always goes to the original sender", async () => {
    const t = setup();
    await t.run(SupportTool.MAIL_REPLY, { id: "m2", body: "On its way" });
    expect(t.sent).toEqual([
      expect.objectContaining({
        from: SUPPORT_ADDRESS,
        to: "dana@example.com",
        subject: "Re: Refund for broken headphones (A-1002)",
        text: "On its way",
      }),
    ]);
  });

  test("mail_forward sends the original text to the given address", async () => {
    const t = setup();
    await t.run(SupportTool.MAIL_FORWARD, { id: "m4", to: "ops@acme-demo.dev" });
    expect(t.sent[0]?.to).toBe("ops@acme-demo.dev");
    expect(t.sent[0]?.text).toContain("Do you ship to Canada");
  });

  test("order_lookup refuses unknown accounts", async () => {
    const t = setup();
    await expect(t.run(SupportTool.ORDER_LOOKUP, { customer: "who@example.com" })).rejects.toThrow(
      "No account",
    );
    expect(await t.run(SupportTool.ORDER_LOOKUP, { customer: "DANA@example.com" })).toEqual([
      expect.objectContaining({ orderId: "A-1002", refundedUsd: 0 }),
    ]);
  });

  test("refund_issue checks the owner and never refunds more than was paid", async () => {
    const t = setup();
    const refund = { customer: "dana@example.com", orderId: "A-1002", reason: "broken" };
    await expect(
      t.run(SupportTool.REFUND_ISSUE, { ...refund, customer: "sam@example.com", amountUsd: 5 }),
    ).rejects.toThrow("does not belong");
    await t.run(SupportTool.REFUND_ISSUE, { ...refund, amountUsd: 150 });
    await expect(t.run(SupportTool.REFUND_ISSUE, { ...refund, amountUsd: 60 })).rejects.toThrow(
      "Only $50",
    );
    expect(t.refunds).toEqual([{ ...refund, amountUsd: 150 }]);
  });
});

describe("mailpit client", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("lists the support inbox and sends through the HTTP API", async () => {
    const fetch = vi.fn(async (url: URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ ID: "new1" });
      expect(url.search).toContain(encodeURIComponent(`to:${SUPPORT_ADDRESS}`));
      return Response.json({
        messages: [
          {
            ID: "x1",
            From: { Name: "Dana", Address: "dana@example.com" },
            To: [{ Name: "", Address: SUPPORT_ADDRESS }],
            Subject: "Hi",
            Created: "2026-10-14T00:00:00Z",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetch);
    const box = mailpit("http://mailpit.test");
    expect(await box.inbox()).toEqual([
      { id: "x1", from: "dana@example.com", subject: "Hi", date: "2026-10-14T00:00:00Z" },
    ]);
    expect(
      await box.send({ from: SUPPORT_ADDRESS, to: "a@b.dev", subject: "s", text: "t" }),
    ).toEqual({ id: "new1" });
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      To: [{ Email: "a@b.dev" }],
    });
  });

  test("fails on a non-2xx response", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
    await expect(mailpit("http://mailpit.test").read("x")).rejects.toThrow("HTTP 500");
  });
});
