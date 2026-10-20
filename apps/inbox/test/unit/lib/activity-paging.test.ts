import { describe, expect, test } from "vitest";

import { parseFilters } from "../../../src/lib/activity-filters";
import {
  activityHref,
  pageCount,
  pageNumbers,
  parsePaging,
} from "../../../src/lib/activity-paging";

describe("activity paging", () => {
  test("reads page and size from the URL and falls back on bad values", () => {
    expect(parsePaging({ page: "3", size: "25" })).toEqual({ page: 3, size: 25 });
    expect(parsePaging({})).toEqual({ page: 1, size: 50 });
    expect(parsePaging({ page: "0", size: "7" })).toEqual({ page: 1, size: 50 });
    expect(parsePaging({ page: "2.5", size: "100" })).toEqual({ page: 1, size: 100 });
    expect(parsePaging({ page: "99999" })).toEqual({ page: 1, size: 50 });
  });

  test("counts pages, with at least one", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });

  test("shows first, last and the pages around the current one", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageNumbers(2, 10)).toEqual([1, 2, 3, null, 10]);
    expect(pageNumbers(10, 10)).toEqual([1, null, 9, 10]);
  });

  test("builds shareable links that keep the filters", () => {
    const filters = parseFilters({ verdict: "block", q: "github" });
    expect(activityHref(filters, { page: 3, size: 25 })).toBe(
      "/activity?verdict=block&q=github&page=3&size=25",
    );
    expect(activityHref(parseFilters({}), { page: 1, size: 50 })).toBe("/activity");
  });
});
