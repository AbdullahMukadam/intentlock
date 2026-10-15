export function normalizePem(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
}
