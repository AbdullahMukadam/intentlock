import { ActivityWindow } from "./enums/activity-window.enum";

const DAY_MS = 24 * 60 * 60 * 1000;

export function activityWindow(window: ActivityWindow, now: Date) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (window) {
    case ActivityWindow.TODAY:
      return { from: new Date(midnight).toISOString(), to: undefined };
    case ActivityWindow.YESTERDAY:
      return {
        from: new Date(midnight - DAY_MS).toISOString(),
        to: new Date(midnight).toISOString(),
      };
    case ActivityWindow.WEEK:
      return { from: new Date(midnight - 6 * DAY_MS).toISOString(), to: undefined };
  }
}
