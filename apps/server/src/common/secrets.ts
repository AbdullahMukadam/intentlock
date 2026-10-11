import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "il_live_";

/** 32 random bytes, base64url (login tokens, session ids, API key bodies; ARCHITECTURE §5.6, §5.8). */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashApiKey(key: string, pepper: string): string {
  return sha256Hex(pepper + key);
}

export function newApiKey(pepper: string) {
  const key = API_KEY_PREFIX + newSecret();
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key, pepper) };
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
