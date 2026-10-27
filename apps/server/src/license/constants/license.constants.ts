export const VENDOR_PUBLIC_KEY = Symbol("VENDOR_PUBLIC_KEY");
export const LICENSE_RECHECK_MS = 60 * 1000;
export const MAX_LICENSE_CHARS = 8192;
// Serializes seat checks so concurrent creates cannot overshoot a limit.
export const LICENSE_LIMIT_LOCK_ID = 7_406_213;
