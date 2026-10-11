import type { Request, Response } from "express";

export const SESSION_COOKIE = "il_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Sliding expiry is only written once this much of the TTL has passed, not on every request. */
export const SESSION_REFRESH_AFTER_MS = 10 * 60 * 1000;
export const CSRF_HEADER = "x-intentlock-csrf";

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name)
      return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, value: string, secure: boolean) {
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response, secure: boolean) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/" });
}
