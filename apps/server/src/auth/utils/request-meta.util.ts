import type { Request } from "express";

import type { RequestMeta } from "../types/request-meta.type.js";

export function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip ?? null, userAgent: req.get("user-agent")?.slice(0, 300) ?? null };
}
