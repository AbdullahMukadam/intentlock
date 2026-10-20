import type { Route } from "next";

import type { ActivityFilters } from "./activity-filters";
import { ACTIVITY_DEFAULT_PAGE_SIZE, ACTIVITY_MAX_PAGE, ACTIVITY_PAGE_SIZES } from "./constants";
import { PageParam } from "./enums/page-param.enum";

export type Paging = { page: number; size: number };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePaging(params: Record<string, string | string[] | undefined>): Paging {
  const page = Number(first(params[PageParam.PAGE]));
  const size = Number(first(params[PageParam.SIZE]));
  return {
    page: Number.isInteger(page) && page >= 1 && page <= ACTIVITY_MAX_PAGE ? page : 1,
    size: (ACTIVITY_PAGE_SIZES as readonly number[]).includes(size)
      ? size
      : ACTIVITY_DEFAULT_PAGE_SIZE,
  };
}

export function pageCount(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size));
}

export function pageNumbers(current: number, last: number): (number | null)[] {
  const shown = [...new Set([1, current - 1, current, current + 1, last])]
    .filter((n) => n >= 1 && n <= last)
    .sort((a, b) => a - b);
  return shown.flatMap((n, i) => (i > 0 && n - (shown[i - 1] ?? n) > 1 ? [null, n] : [n]));
}

export function activityHref(filters: ActivityFilters, { page, size }: Paging): Route {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
  if (page > 1) search.set(PageParam.PAGE, String(page));
  if (size !== ACTIVITY_DEFAULT_PAGE_SIZE) search.set(PageParam.SIZE, String(size));
  const qs = search.toString();
  return (qs ? `/activity?${qs}` : "/activity") as Route;
}
