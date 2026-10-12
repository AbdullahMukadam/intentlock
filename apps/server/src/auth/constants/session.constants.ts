export const SESSION_COOKIE = "il_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Sliding expiry is only written once this much of the TTL has passed, not on every request. */
export const SESSION_REFRESH_AFTER_MS = 10 * 60 * 1000;
