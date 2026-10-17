import { createRemoteJWKSet, customFetch } from "jose";

import { retryingFetch } from "./retrying-fetch.js";

const COOLDOWN_MS = 30_000;
const CACHE_MAX_AGE_MS = 10 * 60_000;

export function remoteJwks(url: string, fetchImpl: typeof fetch) {
  return createRemoteJWKSet(new URL(url), {
    cooldownDuration: COOLDOWN_MS,
    cacheMaxAge: CACHE_MAX_AGE_MS,
    [customFetch]: retryingFetch(fetchImpl),
  });
}
