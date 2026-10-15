import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, opts, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P, maxmem: MAX_MEMORY });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

let dummyHash: Promise<string> | undefined;

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const target = stored ?? (await (dummyHash ??= hashPassword("intentlock-no-such-password")));
  const [scheme, n, r, p, salt, hash] = target.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEMORY,
  });
  return key.length === expected.length && timingSafeEqual(key, expected) && stored !== null;
}

export function isWeakPassword(email: string, password: string): boolean {
  const pw = password.toLowerCase();
  const local = email.toLowerCase().split("@")[0] ?? "";
  return pw.includes(email.toLowerCase()) || (local.length >= 3 && pw.includes(local));
}
