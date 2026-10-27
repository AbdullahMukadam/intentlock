import { LicenseNotice } from "../../../../src/license/enums/license-notice.enum.js";
import { dueExpiryNotice } from "../../../../src/license/utils/due-notice.util.js";

const now = new Date("2027-01-01T00:00:00Z");
const inDays = (days: number) => now.getTime() / 1000 + days * 86_400;

describe("dueExpiryNotice", () => {
  it.each([
    [90, null],
    [30.5, null],
    [30, LicenseNotice.EXPIRES_IN_30_DAYS],
    [8, LicenseNotice.EXPIRES_IN_30_DAYS],
    [7, LicenseNotice.EXPIRES_IN_7_DAYS],
    [2, LicenseNotice.EXPIRES_IN_7_DAYS],
    [1, LicenseNotice.EXPIRES_IN_1_DAY],
    [0.1, LicenseNotice.EXPIRES_IN_1_DAY],
    [0, null],
    [-3, null],
  ])("%s days left → %s", (days, notice) => {
    expect(dueExpiryNotice(inDays(days), now)).toBe(notice);
  });
});
