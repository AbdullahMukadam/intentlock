import { isServer, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api-error";
import { QUERY_KEY_ROOT, QUERY_MAX_RETRIES, QUERY_STALE_MS } from "./constants";
import { HttpStatus } from "./enums/http-status.enum";

export function queryKeyFor(url: string) {
  const [path = "", search = ""] = url.split("?");
  return [QUERY_KEY_ROOT, path, search] as const;
}

export function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status < HttpStatus.INTERNAL_SERVER_ERROR) return false;
  return failureCount < QUERY_MAX_RETRIES;
}

export function createQueryClient() {
  const clearOnUnauthorized = (error: unknown) => {
    if (error instanceof ApiError && error.status === HttpStatus.UNAUTHORIZED) client.clear();
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: clearOnUnauthorized }),
    mutationCache: new MutationCache({ onError: clearOnUnauthorized }),
    defaultOptions: { queries: { staleTime: QUERY_STALE_MS, retry: shouldRetry } },
  });
  return client;
}

let browserClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) return createQueryClient();
  browserClient ??= createQueryClient();
  return browserClient;
}

export function invalidateAll() {
  if (!browserClient) return;
  browserClient.invalidateQueries({ queryKey: [QUERY_KEY_ROOT] }).catch(() => undefined);
}
