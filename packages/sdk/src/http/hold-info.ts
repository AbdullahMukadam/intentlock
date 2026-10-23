import { API_ENDPOINTS, apiPath, HoldInfo } from "@intentlock/core";

import { HttpMethod } from "../enums/http-method.enum.js";
import { GateUnavailableError } from "../errors.js";
import type { HttpClient } from "./client.js";

export async function holdInfo(http: HttpClient, holdId: string): Promise<HoldInfo> {
  const res = await http.request(
    HttpMethod.GET,
    `${apiPath(API_ENDPOINTS.HOLD_WAIT, { id: holdId })}?timeout=0`,
  );
  const parsed = HoldInfo.safeParse(res);
  if (!parsed.success) throw new GateUnavailableError("Malformed hold from the server");
  return parsed.data;
}
