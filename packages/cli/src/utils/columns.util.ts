export function columns(rows: (string | number | null | undefined)[][]): string[] {
  const cells = rows.map((r) => r.map((c) => (c === null || c === undefined ? "-" : String(c))));
  const widths = cells[0]?.map((_, i) => Math.max(...cells.map((r) => r[i]?.length ?? 0))) ?? [];
  return cells.map((r) =>
    r
      .map((c, i) => c.padEnd(widths[i] ?? 0))
      .join("  ")
      .trimEnd(),
  );
}
