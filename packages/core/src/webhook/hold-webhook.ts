import { base64url } from "jose";
import { z } from "zod";

import { HoldStatus } from "../enums/hold-status.enum.js";
import { WebhookEventType } from "../enums/webhook-event-type.enum.js";

export const WEBHOOK_SIGNATURE_HEADER = "intentlock-signature";
export const WEBHOOK_EVENT_ID_HEADER = "intentlock-event-id";
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export const HoldWebhookEvent = z.object({
  id: z.string().min(1),
  type: z.literal(WebhookEventType.HOLD_RESOLVED),
  at: z.iso.datetime(),
  holdId: z.string().min(1),
  planId: z.string().min(1),
  agentId: z.string().min(1),
  status: z.enum(HoldStatus),
});
export type HoldWebhookEvent = z.infer<typeof HoldWebhookEvent>;

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64url.encode(new Uint8Array(mac));
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signWebhook(secret: string, body: string, at: Date): Promise<string> {
  const t = Math.floor(at.getTime() / 1000);
  return `t=${t},v1=${await hmac(secret, `${t}.${body}`)}`;
}

export async function verifyWebhook(
  secret: string,
  body: string,
  header: string | null | undefined,
  now: Date,
): Promise<HoldWebhookEvent | null> {
  if (!header) return null;
  const parts = new Map(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    }),
  );
  const t = Number(parts.get("t"));
  const v1 = parts.get("v1");
  if (!Number.isInteger(t) || !v1) return null;
  if (Math.abs(now.getTime() / 1000 - t) > WEBHOOK_TOLERANCE_SECONDS) return null;
  if (!sameString(await hmac(secret, `${t}.${body}`), v1)) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = HoldWebhookEvent.safeParse(json);
  return parsed.success ? parsed.data : null;
}
