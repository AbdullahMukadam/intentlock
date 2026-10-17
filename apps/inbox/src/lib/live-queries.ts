"use client";

import { API_ENDPOINTS, type ApiEndpoint } from "@intentlock/core";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiUrl } from "./api";
import { EventName } from "./enums/event-name.enum";
import { connect } from "./socket";

const HOLD_PATHS: ApiEndpoint[] = [
  API_ENDPOINTS.HOLDS,
  API_ENDPOINTS.AUDIT,
  API_ENDPOINTS.STATS_OVERVIEW,
  API_ENDPOINTS.RUNS,
];

export const EVENT_QUERY_PATHS: Record<EventName, ApiEndpoint[]> = {
  [EventName.HOLD_CREATED]: HOLD_PATHS,
  [EventName.HOLD_RESOLVED]: HOLD_PATHS,
  [EventName.DECISION]: [
    API_ENDPOINTS.AUDIT,
    API_ENDPOINTS.STATS_OVERVIEW,
    API_ENDPOINTS.RUNS,
    API_ENDPOINTS.AGENTS,
  ],
};

const ALL_PATHS = [...new Set(Object.values(EVENT_QUERY_PATHS).flat())];

export function invalidatePaths(client: QueryClient, endpoints: ApiEndpoint[]) {
  const prefixes = endpoints.map((e) => apiUrl(e));
  return client
    .invalidateQueries({
      predicate: ({ queryKey }) => {
        const path = queryKey[1];
        return (
          typeof path === "string" && prefixes.some((p) => path === p || path.startsWith(`${p}/`))
        );
      },
    })
    .catch(() => undefined);
}

export function useLiveQueries() {
  const client = useQueryClient();
  useEffect(() => {
    const socket = connect();
    const handlers = Object.values(EventName).map((name) => {
      const handler = () => invalidatePaths(client, EVENT_QUERY_PATHS[name]);
      socket.on(name, handler);
      return [name, handler] as const;
    });
    const onConnect = () => invalidatePaths(client, ALL_PATHS);
    socket.on("connect", onConnect);
    return () => {
      for (const [name, handler] of handlers) socket.off(name, handler);
      socket.off("connect", onConnect);
    };
  }, [client]);
}
