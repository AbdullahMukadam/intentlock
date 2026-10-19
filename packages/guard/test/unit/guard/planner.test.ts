import { describe, expect, test } from "vitest";
import { z } from "zod";

import { planWithModel } from "../../../src/guard/planner.js";
import { FakeProvider } from "../../../src/provider/fake.js";
import { defineTool } from "../../../src/tools/define-tool.js";

const impl = async () => ({});

const sendEmail = defineTool({
  name: "email_send",
  description: "Send an email",
  schema: z.object({ to: z.string(), subject: z.string(), cc: z.string().optional() }),
  impl,
});
const refund = defineTool({
  name: "refund_issue",
  description: "Refund an order",
  schema: z.object({ orderId: z.string(), amountUsd: z.number() }),
  impl,
});
const ping = defineTool({
  name: "ping",
  description: "Check the service",
  schema: z.object({}),
  impl,
});

describe("planner prompt", () => {
  test("lists every tool with its argument names, types and whether they are optional", async () => {
    const provider = new FakeProvider([
      {
        toolCalls: [
          {
            id: "p1",
            name: "declare_plan",
            args: {
              goal: "Refund",
              steps: [{ tool: "refund_issue", args: { orderId: { eq: "A-1" } } }],
            },
          },
        ],
      },
    ]);
    await planWithModel(provider, {
      user: "sam@acme.dev",
      task: "Refund order A-1",
      tools: [sendEmail, refund, ping],
    });

    const first = provider.requests[0]!.messages[0]!;
    const prompt = "text" in first ? (first.text ?? "") : "";
    expect(prompt).toContain(
      "- email_send: Send an email\n  arguments: to (string), subject (string), cc (string, optional)",
    );
    expect(prompt).toContain(
      "- refund_issue: Refund an order\n  arguments: orderId (string), amountUsd (number)",
    );
    expect(prompt).toContain("- ping: Check the service\n  arguments: none");
    expect(provider.requests[0]!.system).toMatch(/only the argument names listed/);
  });
});
