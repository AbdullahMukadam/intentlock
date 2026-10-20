import { API_ENDPOINTS, type Role } from "@intentlock/core";
import type { QueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { z } from "zod";

import { parseFilters, toAuditQuery } from "./activity-filters";
import { apiUrl, request } from "./api";
import { ACTIVITY_DEFAULT_PAGE_SIZE, LATEST_ACTIVITY_LIMIT } from "./constants";
import { HoldState } from "./enums/hold-state.enum";
import { UiAction } from "./enums/ui-action.enum";
import { can } from "./permissions";
import { queryKeyFor } from "./query-client";
import { statsWindow } from "./stats-window";

const DAY_MS = 24 * 60 * 60 * 1000;
const Raw = z.unknown();

const PAGE_QUERIES: Partial<Record<Route, (role: Role) => string[]>> = {
  "/": () => {
    const span = statsWindow(DAY_MS);
    return [
      apiUrl(API_ENDPOINTS.AGENTS),
      apiUrl(API_ENDPOINTS.STATS_OVERVIEW, { query: { from: span.from } }),
      apiUrl(API_ENDPOINTS.STATS_OVERVIEW, { query: { from: span.prevFrom, to: span.from } }),
      apiUrl(API_ENDPOINTS.AUDIT, { query: { limit: LATEST_ACTIVITY_LIMIT } }),
    ];
  },
  "/activity": () => [
    apiUrl(API_ENDPOINTS.AGENTS),
    apiUrl(API_ENDPOINTS.AUDIT, {
      query: { ...toAuditQuery(parseFilters({})), page: 1, limit: ACTIVITY_DEFAULT_PAGE_SIZE },
    }),
  ],
  "/holds": () => [
    apiUrl(API_ENDPOINTS.AGENTS),
    apiUrl(API_ENDPOINTS.HOLDS, { query: { status: HoldState.PENDING } }),
  ],
  "/agents": () => [apiUrl(API_ENDPOINTS.AGENTS)],
  "/team": (role) => [
    apiUrl(API_ENDPOINTS.USERS),
    ...(can(role, UiAction.MANAGE_TEAM) ? [apiUrl(API_ENDPOINTS.INVITES)] : []),
  ],
  "/account": () => [
    apiUrl(API_ENDPOINTS.ACCOUNT),
    apiUrl(API_ENDPOINTS.AUTH_METHODS),
    apiUrl(API_ENDPOINTS.ACCOUNT_SESSIONS),
  ],
};

export function pageQueryUrls(href: Route, role: Role): string[] {
  return PAGE_QUERIES[href]?.(role) ?? [];
}

export function prefetchPage(client: QueryClient, href: Route, role: Role) {
  for (const url of pageQueryUrls(href, role)) {
    client
      .prefetchQuery({ queryKey: queryKeyFor(url), queryFn: () => request(url, Raw) })
      .catch(() => undefined);
  }
}
