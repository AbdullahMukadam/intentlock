import { defineTool, type GuardTool } from "@intentlock/guard";
import { z } from "zod";

import { EmailTool } from "../enums/email-tool.enum.js";
import { type EmailState, SUPPORT } from "../mocks/email.js";

const MessageId = z.string().min(1).max(100).describe("Message id from mail_list");
const Customer = z.email().describe("Customer email address");

export function emailTools(state: EmailState): GuardTool[] {
  const read = (id: string) => {
    const m = state.inbox.find((x) => x.id === id);
    if (!m) throw new Error(`No message ${id}`);
    return m;
  };
  const refunded = (orderId: string) =>
    state.refunds.filter((r) => r.orderId === orderId).reduce((sum, r) => sum + r.amountUsd, 0);
  return [
    defineTool({
      name: EmailTool.MAIL_LIST,
      description: `List emails in the support inbox (${SUPPORT})`,
      schema: z.object({}),
      impl: async () => state.inbox.map(({ id, from, subject }) => ({ id, from, subject })),
    }),
    defineTool({
      name: EmailTool.MAIL_READ,
      description: "Read one email including its body",
      schema: z.object({ id: MessageId }),
      impl: async ({ id }) => read(id),
    }),
    defineTool({
      name: EmailTool.MAIL_REPLY,
      description: "Reply to the sender of an email",
      schema: z.object({ id: MessageId, body: z.string().min(1).max(5000) }),
      impl: async ({ id, body }) => {
        const m = read(id);
        state.sent.push({ from: SUPPORT, to: m.from, subject: `Re: ${m.subject}`, text: body });
        return { replied: m.from };
      },
    }),
    defineTool({
      name: EmailTool.MAIL_FORWARD,
      description: "Forward an email to another address",
      schema: z.object({ id: MessageId, to: z.email() }),
      impl: async ({ id, to }) => {
        const m = read(id);
        state.sent.push({
          from: SUPPORT,
          to,
          subject: `Fwd: ${m.subject}`,
          text: `From: ${m.from}\n\n${m.text}`,
        });
        return { forwarded: id, to };
      },
    }),
    defineTool({
      name: EmailTool.ORDER_LOOKUP,
      description: "Look up a customer's orders, shipping address, notes and refunds",
      schema: z.object({ customer: Customer }),
      impl: async ({ customer }) => {
        const mine = state.orders.filter(
          (o) => o.customer.toLowerCase() === customer.toLowerCase(),
        );
        if (mine.length === 0) throw new Error(`No account for ${customer}`);
        return mine.map((o) => ({ ...o, refundedUsd: refunded(o.orderId) }));
      },
    }),
    defineTool({
      name: EmailTool.REFUND_ISSUE,
      description: "Refund part or all of a customer's order, in US dollars",
      schema: z.object({
        customer: Customer,
        orderId: z.string().min(1).max(40),
        amountUsd: z.number().positive(),
        reason: z.string().min(1).max(500),
      }),
      impl: async ({ customer, orderId, amountUsd }) => {
        const o = state.orders.find((x) => x.orderId === orderId);
        if (!o || o.customer.toLowerCase() !== customer.toLowerCase()) {
          throw new Error(`Order ${orderId} does not belong to ${customer}`);
        }
        if (amountUsd > o.totalUsd - refunded(orderId)) {
          throw new Error("Refund exceeds what was paid");
        }
        state.refunds.push({ customer, orderId, amountUsd });
        return { refunded: amountUsd, orderId };
      },
    }),
  ];
}
