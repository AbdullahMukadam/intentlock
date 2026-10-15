import { StatsBucket } from "./enums/stats-bucket.enum";
import type { Overview } from "./schemas";

const STEP_MS: Record<StatsBucket, number> = {
  [StatsBucket.HOUR]: 60 * 60 * 1000,
  [StatsBucket.DAY]: 24 * 60 * 60 * 1000,
};

export type SeriesPoint = Overview["series"][number];

export function fillSeries(o: Overview): SeriesPoint[] {
  const step = (STEP_MS as Record<string, number | undefined>)[o.bucket];
  if (!step) return o.series;
  const byTime = new Map(o.series.map((s) => [new Date(s.bucket).getTime(), s]));
  const start = Math.floor(new Date(o.from).getTime() / step) * step;
  const end = new Date(o.to).getTime();
  const out: SeriesPoint[] = [];
  for (let t = start; t <= end; t += step) {
    out.push(byTime.get(t) ?? { bucket: new Date(t).toISOString(), allow: 0, block: 0, hold: 0 });
  }
  return out;
}
