import canonicalize from "canonicalize";
import { base64url } from "jose";

import type { Plan } from "./schemas/plan.js";
import type { PolicySet } from "./schemas/policy.js";

export function jcs(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new TypeError("Value cannot be canonicalized");
  return out;
}

// WebCrypto keeps core free of node: imports so the same code runs in the browser (inbox).
export async function sha256Base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64url.encode(new Uint8Array(digest));
}

export function planHash(plan: Plan): Promise<string> {
  return sha256Base64url(jcs(plan));
}

export function policyHash(policy: PolicySet): Promise<string> {
  return sha256Base64url(jcs(policy));
}
