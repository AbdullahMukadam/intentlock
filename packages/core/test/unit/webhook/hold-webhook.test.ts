import { expect, test } from "vitest";

import { HoldStatus } from "../../../src/enums/hold-status.enum.js";
import { WebhookEventType } from "../../../src/enums/webhook-event-type.enum.js";
import {
  signWebhook,
  verifyWebhook,
  WEBHOOK_TOLERANCE_SECONDS,
} from "../../../src/webhook/hold-webhook.js";

const at = new Date("2026-10-23T10:00:00Z");
const body = JSON.stringify({
  id: "ev1",
  type: WebhookEventType.HOLD_RESOLVED,
  at: at.toISOString(),
  holdId: "h1",
  planId: "p1",
  agentId: "a1",
  status: HoldStatus.APPROVED,
});

test("a signed event verifies and parses", async () => {
  const header = await signWebhook("s3cret", body, at);
  expect(header).toMatch(/^t=\d+,v1=[\w-]+$/);
  expect(await verifyWebhook("s3cret", body, header, at)).toMatchObject({
    holdId: "h1",
    status: "approved",
  });
});

test("wrong secret, edited body, missing header or old timestamp are refused", async () => {
  const header = await signWebhook("s3cret", body, at);
  expect(await verifyWebhook("other", body, header, at)).toBeNull();
  expect(
    await verifyWebhook("s3cret", body.replace("approved", "rejected"), header, at),
  ).toBeNull();
  expect(await verifyWebhook("s3cret", body, undefined, at)).toBeNull();
  expect(await verifyWebhook("s3cret", body, "garbage", at)).toBeNull();
  const late = new Date(at.getTime() + (WEBHOOK_TOLERANCE_SECONDS + 1) * 1000);
  expect(await verifyWebhook("s3cret", body, header, late)).toBeNull();
});

test("a correctly signed body that is not a hold event is refused", async () => {
  const other = JSON.stringify({ hello: "world" });
  expect(
    await verifyWebhook("s3cret", other, await signWebhook("s3cret", other, at), at),
  ).toBeNull();
});
