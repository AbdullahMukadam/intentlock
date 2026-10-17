import { API_ENDPOINTS } from "@intentlock/core";
import { z } from "zod";

import { api } from "./api";
import { LOGIN_PATH } from "./constants";
import { HttpMethod } from "./enums/http-method.enum";
import { getQueryClient } from "./query-client";

export async function signOut() {
  await api(API_ENDPOINTS.AUTH_LOGOUT, z.undefined(), { method: HttpMethod.POST }).catch(
    () => undefined,
  );
  getQueryClient().clear();
  window.location.assign(LOGIN_PATH);
}
