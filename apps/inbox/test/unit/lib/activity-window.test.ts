import { expect, test } from "vitest";

import { activityWindow } from "../../../src/lib/activity-window";
import { ActivityWindow } from "../../../src/lib/enums/activity-window.enum";

const now = new Date(2026, 9, 24, 15, 30);
const iso = (d: number) => new Date(2026, 9, d).toISOString();

test("today starts at local midnight and stays open", () => {
  expect(activityWindow(ActivityWindow.TODAY, now)).toEqual({ from: iso(24), to: undefined });
});

test("yesterday is the whole previous local day", () => {
  expect(activityWindow(ActivityWindow.YESTERDAY, now)).toEqual({ from: iso(23), to: iso(24) });
});

test("this week covers today and the six days before", () => {
  expect(activityWindow(ActivityWindow.WEEK, now)).toEqual({ from: iso(18), to: undefined });
});
