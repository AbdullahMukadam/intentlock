import { newSecret, sha256Hex } from "../../../common/utils/crypto.util.js";

export const API_KEY_PREFIX = "il_live_";

export function hashApiKey(key: string, pepper: string): string {
  return sha256Hex(pepper + key);
}

/** `il_live_` + 32 random bytes; only the hash and the first 12 chars are stored (ARCHITECTURE §5.8). */
export function newApiKey(pepper: string) {
  const key = API_KEY_PREFIX + newSecret();
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key, pepper) };
}
