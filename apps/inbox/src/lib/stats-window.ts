export const STATS_WINDOW_STEP_MS = 5 * 60 * 1000;

export function statsWindow(rangeMs: number, at = Date.now()) {
  const now = Math.floor(at / STATS_WINDOW_STEP_MS) * STATS_WINDOW_STEP_MS;
  return {
    from: new Date(now - rangeMs).toISOString(),
    prevFrom: new Date(now - 2 * rangeMs).toISOString(),
  };
}
