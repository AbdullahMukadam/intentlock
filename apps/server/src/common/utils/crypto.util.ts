import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url (login tokens, session ids, API key bodies; ARCHITECTURE §5.6, §5.8). */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
