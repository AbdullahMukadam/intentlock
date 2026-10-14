import { verdictColor } from "@/lib/verdict-colors";

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: verdictColor(verdict) }}
      />
      {verdict}
    </span>
  );
}
