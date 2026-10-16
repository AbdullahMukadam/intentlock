import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { REQUEST_ID_HEADER } from "../constants/http.constants.js";

type RequestContext = { requestId: string };

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get(REQUEST_ID_HEADER);
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  storage.run({ requestId }, next);
}
