"use client";

import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";

import { request } from "./api";

type State<T> = { url: string; data?: T; error?: unknown };

export function useApi<S extends z.ZodType>(url: string | null, schema: S) {
  const [state, setState] = useState<State<z.infer<S>> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!url) return;
    let live = true;
    request(url, schema).then(
      (data) => live && setState({ url, data }),
      (error: unknown) => live && setState({ url, error }),
    );
    return () => {
      live = false;
    };
  }, [url, schema, version]);

  const current = state?.url === url ? state : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: url !== null && !current,
    reload: useCallback(() => setVersion((v) => v + 1), []),
  };
}
