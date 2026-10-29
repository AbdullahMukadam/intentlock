import { describe, expect, test } from "vitest";

import { LicenseEdition } from "../../../src/lib/enums/license-edition.enum";
import { LicenseSource } from "../../../src/lib/enums/license-source.enum";
import { LicenseStatus } from "../../../src/lib/enums/license-status.enum";
import {
  daysUntilExpiry,
  formatLimit,
  licenseLabel,
  limitBreaches,
} from "../../../src/lib/license";
import type { License } from "../../../src/lib/schemas";

const FREE: License = {
  edition: LicenseEdition.FREE,
  licensee: "Free",
  status: LicenseStatus.MISSING,
  source: LicenseSource.NONE,
  maxUsers: 5,
  usedUsers: 5,
  maxAgents: 3,
  usedAgents: 3,
  retentionDays: 30,
  expiresAt: null,
  graceEndsAt: null,
};

describe("license helpers", () => {
  test("at the limit is not over it", () => {
    expect(limitBreaches(FREE)).toEqual([]);
  });

  test("over the free limits after a license expired lists each limit", () => {
    expect(limitBreaches({ ...FREE, usedUsers: 12, usedAgents: 4 })).toEqual([
      { resource: "users", used: 12, max: 5 },
      { resource: "agents", used: 4, max: 3 },
    ]);
  });

  test("unlimited is never over", () => {
    expect(limitBreaches({ ...FREE, maxAgents: null, usedAgents: 99 })).toEqual([]);
  });

  test("labels show who the license belongs to", () => {
    expect(licenseLabel(FREE)).toBe("Free");
    expect(licenseLabel({ ...FREE, edition: LicenseEdition.LICENSED, licensee: "Acme" })).toBe(
      "Licensed to Acme",
    );
  });

  test("limits read as used of max", () => {
    expect(formatLimit(3, 25)).toBe("3 of 25");
    expect(formatLimit(7, null)).toBe("7 (unlimited)");
  });
  test("warns only in the last 30 days of a valid license", () => {
    const now = Date.parse("2027-01-01T00:00:00Z");
    const paid = { ...FREE, edition: LicenseEdition.LICENSED, status: LicenseStatus.VALID };
    const at = (iso: string) => daysUntilExpiry({ ...paid, expiresAt: iso }, now);
    expect(at("2027-03-01T00:00:00Z")).toBeNull();
    expect(at("2027-01-31T00:00:00Z")).toBe(30);
    expect(at("2027-01-01T12:00:00Z")).toBe(1);
    expect(daysUntilExpiry(FREE, now)).toBeNull();
    expect(
      daysUntilExpiry(
        { ...paid, status: LicenseStatus.GRACE, expiresAt: "2026-12-30T00:00:00Z" },
        now,
      ),
    ).toBeNull();
  });
});
