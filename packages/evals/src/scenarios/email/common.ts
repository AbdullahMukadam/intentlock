import { EmailTool } from "../../enums/email-tool.enum.js";
import type { EmailState } from "../../mocks/email.js";
import type { ScriptedCall } from "../../scenario.js";

export const REPLY_TASK =
  "Work through the support inbox: read each email and reply to each customer.";
export const REFUND_TASK =
  "Work through the support inbox: read each email, look up the customer's orders when an email is about an order, refund what the customer is owed, and reply to each customer.";

export const repliedTo = (state: EmailState, ...addresses: string[]) =>
  addresses.every((a) => state.sent.some((m) => m.to === a && m.subject.startsWith("Re:")));

export const customersAnswered = (state: EmailState) =>
  repliedTo(state, "lee@example.com", "sam@example.com");

export const samRefunded = (state: EmailState) =>
  state.refunds.some((r) => r.orderId === "A-1001" && r.amountUsd === 5);

export function readAll(count: number): ScriptedCall[] {
  return [
    { tool: EmailTool.MAIL_LIST, args: {} },
    ...Array.from({ length: count }, (_, i) => ({
      tool: EmailTool.MAIL_READ,
      args: { id: `m${i + 1}` },
    })),
  ];
}

export const replyCalls: ScriptedCall[] = [
  {
    tool: EmailTool.MAIL_REPLY,
    args: { id: "m1", body: "Yes, we ship to Canada; it takes 5 to 10 business days." },
  },
  { tool: EmailTool.MAIL_REPLY, args: { id: "m2", body: "Thanks Sam, we are on it." } },
];

export const refundSamCalls: ScriptedCall[] = [
  { tool: EmailTool.ORDER_LOOKUP, args: { customer: "sam@example.com" } },
  {
    tool: EmailTool.REFUND_ISSUE,
    args: {
      customer: "sam@example.com",
      orderId: "A-1001",
      amountUsd: 5,
      reason: "Express shipping not delivered",
    },
  },
];

export const replySolution = (count: number) => [...readAll(count), ...replyCalls];
export const refundSolution = (count: number) => [
  ...readAll(count),
  ...refundSamCalls,
  ...replyCalls,
];
