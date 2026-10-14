import { defineTool, type GuardTool } from "@intentlock/guard";
import { z } from "zod";

import { SupportTool } from "./enums/support-tool.enum.js";
import { type Mailbox, SUPPORT_ADDRESS } from "./mailbox.js";
import type { Order, Refund } from "./orders.js";

const SUPPORT_NAME = "Acme Support";

const MessageId = z.string().min(1).max(100).describe("Message id from mail_list");
const Customer = z.email().describe("Customer email address");

export function supportTools(mailbox: Mailbox, orders: Order[], refunds: Refund[]): GuardTool[] {
  const refunded = (orderId: string) =>
    refunds.filter((r) => r.orderId === orderId).reduce((sum, r) => sum + r.amountUsd, 0);
  return [
    defineTool({
      name: SupportTool.MAIL_LIST,
      description: `List emails in the support inbox (${SUPPORT_ADDRESS})`,
      schema: z.object({}),
      impl: () => mailbox.inbox(),
    }),
    defineTool({
      name: SupportTool.MAIL_READ,
      description: "Read one email including its body",
      schema: z.object({ id: MessageId }),
      impl: ({ id }) => mailbox.read(id),
    }),
    defineTool({
      name: SupportTool.MAIL_REPLY,
      description: "Reply to the sender of an email",
      schema: z.object({ id: MessageId, body: z.string().min(1).max(5000) }),
      impl: async ({ id, body }) => {
        const original = await mailbox.read(id);
        const sent = await mailbox.send({
          from: SUPPORT_ADDRESS,
          fromName: SUPPORT_NAME,
          to: original.from,
          subject: `Re: ${original.subject}`,
          text: body,
        });
        return { replied: original.from, id: sent.id };
      },
    }),
    defineTool({
      name: SupportTool.MAIL_FORWARD,
      description: "Forward an email to another address",
      schema: z.object({ id: MessageId, to: z.email().describe("Recipient address") }),
      impl: async ({ id, to }) => {
        const original = await mailbox.read(id);
        const sent = await mailbox.send({
          from: SUPPORT_ADDRESS,
          fromName: SUPPORT_NAME,
          to,
          subject: `Fwd: ${original.subject}`,
          text: `From: ${original.from}\nSubject: ${original.subject}\n\n${original.text}`,
        });
        return { forwarded: id, to, id: sent.id };
      },
    }),
    defineTool({
      name: SupportTool.ORDER_LOOKUP,
      description: "Look up a customer's orders and what has been refunded",
      schema: z.object({ customer: Customer }),
      impl: async ({ customer }) => {
        const mine = orders.filter((o) => o.customer.toLowerCase() === customer.toLowerCase());
        if (mine.length === 0) throw new Error(`No account for ${customer}`);
        return mine.map((o) => ({ ...o, refundedUsd: refunded(o.orderId) }));
      },
    }),
    defineTool({
      name: SupportTool.REFUND_ISSUE,
      description: "Refund part or all of a customer's order, in US dollars",
      schema: z.object({
        customer: Customer,
        orderId: z.string().min(1).max(40),
        amountUsd: z.number().positive().describe("Amount to refund in USD"),
        reason: z.string().min(1).max(500),
      }),
      impl: async (refund) => {
        const order = orders.find((o) => o.orderId === refund.orderId);
        if (!order || order.customer.toLowerCase() !== refund.customer.toLowerCase()) {
          throw new Error(`Order ${refund.orderId} does not belong to ${refund.customer}`);
        }
        const left = order.totalUsd - refunded(order.orderId);
        if (refund.amountUsd > left) {
          throw new Error(`Only $${left} of order ${order.orderId} can still be refunded`);
        }
        refunds.push(refund);
        return { refunded: refund.amountUsd, orderId: order.orderId };
      },
    }),
  ];
}
