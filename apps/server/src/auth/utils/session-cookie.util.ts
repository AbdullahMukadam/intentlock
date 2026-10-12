import type { Request, Response } from "express";

import { SESSION_COOKIE, SESSION_TTL_MS } from "../constants/session.constants.js";

export function parseCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function readCookie(req: Request, name: string): string | undefined {
  return parseCookie(req.headers.cookie, name);
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
