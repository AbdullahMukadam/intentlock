import { Role } from "@intentlock/core";
import { describe, expect, test } from "vitest";

import { changeLabel } from "../../../src/components/overview/kpi-panel";
import { StatsBucket } from "../../../src/lib/enums/stats-bucket.enum";
import { UiAction } from "../../../src/lib/enums/ui-action.enum";
import { fillSeries } from "../../../src/lib/fill-series";
import { firstName, formatRelative, initials, parseGroups } from "../../../src/lib/format";
import { can } from "../../../src/lib/permissions";
import type { Overview } from "../../../src/lib/schemas";

const overview = (series: Overview["series"]): Overview => ({
  from: "2026-10-15T00:30:00.000Z",
  to: "2026-10-15T03:10:00.000Z",
  bucket: StatsBucket.HOUR,
  series,
  totals: { allow: 0, block: 0, hold: 0 },
  pendingHolds: 0,
  holdOutcomes: { approved: 0, rejected: 0, expired: 0 },
  medianApprovalSeconds: null,
  topBlockedTools: [],
  topBlockedRules: [],
  flagged: 0,
  auditLag: null,
});

describe("fillSeries", () => {
  test("adds a zero bucket for every empty hour in the range and keeps real ones", () => {
    const real = { bucket: "2026-10-15T02:00:00.000Z", allow: 3, block: 1, hold: 0 };
    const filled = fillSeries(overview([real]));
    expect(filled.map((s) => s.bucket)).toEqual([
      "2026-10-15T00:00:00.000Z",
      "2026-10-15T01:00:00.000Z",
      "2026-10-15T02:00:00.000Z",
      "2026-10-15T03:00:00.000Z",
    ]);
    expect(filled[2]).toBe(real);
    expect(filled[0]).toMatchObject({ allow: 0, block: 0, hold: 0 });
  });
});

describe("changeLabel", () => {
  test.each([
    [12, 10, "+20%", 1],
    [9, 10, "-10%", -1],
    [5, 0, "new", 1],
    [0, 0, "0%", 0],
    [101, 100, "+1.0%", 1],
  ])("%i vs %i → %s", (current, previous, text, sign) => {
    expect(changeLabel(current, previous)).toEqual({ text, sign });
  });

  test("is empty without a previous period", () => {
    expect(changeLabel(3, undefined)).toBeNull();
  });
});

describe("format helpers", () => {
  test("parseGroups lowercases, trims and drops empties", () => {
    expect(parseGroups(" Oncall, support-leads,, ")).toEqual(["oncall", "support-leads"]);
  });

  test("names and initials come from the email", () => {
    expect(firstName("samantha.walker@acme.dev")).toBe("Samantha");
    expect(initials("samantha.walker@acme.dev")).toBe("SW");
    expect(initials("admin@acme.dev")).toBe("AD");
  });

  test("formatRelative picks a sensible unit", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(formatRelative("2026-10-15T12:05:00Z", now)).toMatch(/5 minutes/);
    expect(formatRelative("2026-10-22T12:00:00Z", now)).toMatch(/7 days/);
  });
});

test("only admins manage the team", () => {
  expect(can(Role.enum.admin, UiAction.MANAGE_TEAM)).toBe(true);
  expect(can(Role.enum.approver, UiAction.MANAGE_TEAM)).toBe(false);
  expect(can(Role.enum.member, UiAction.MANAGE_TEAM)).toBe(false);
});
