export const VENDOR_PUBLIC_KEY = Symbol("VENDOR_PUBLIC_KEY");
export const LICENSE_RECHECK_MS = 24 * 60 * 60 * 1000;
// Serializes seat checks so concurrent creates cannot overshoot a limit.
export const LICENSE_LIMIT_LOCK_ID = 7_406_213;
