"use client";

import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { z } from "zod";

import { parseResponse, request } from "./api";
import { queryKeyFor } from "./query-client";

const Raw = z.unknown();

type Options = { refetchInterval?: number };

export function useApi<S extends z.ZodType>(
  url: string | null,
  schema: S,
  { refetchInterval }: Options = {},
) {
  const select = useCallback((raw: unknown): z.infer<S> => parseResponse(schema, raw), [schema]);
  const query = useQuery({
    queryKey: queryKeyFor(url ?? ""),
    queryFn: url === null ? skipToken : () => request(url, Raw),
    select,
    placeholderData: url === null ? undefined : keepPreviousData,
    refetchInterval,
  });
  const { refetch } = query;
  const enabled = url !== null;
  return {
    data: query.data,
    error: query.error ?? undefined,
    loading: enabled && query.isPending,
    stale: query.isPlaceholderData,
    reload: useCallback(() => {
      if (enabled) refetch({ cancelRefetch: false }).catch(() => undefined);
    }, [enabled, refetch]),
  };
}
