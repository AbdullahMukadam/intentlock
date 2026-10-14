import { VerdictBadge } from "@/components/verdict-badge";
import type { GuardEventView } from "@/lib/runner-events";

export function EventRow({ event: e }: { event: GuardEventView }) {
  const why = [e.ruleId, e.reason].filter(Boolean).join(" · ");
  return (
    <li className="grid grid-cols-[4.5rem_6rem_1fr] gap-2 border-t py-1.5 text-xs">
      <span className="text-muted-foreground tabular-nums">{e.at.slice(11, 19)}</span>
      <VerdictBadge verdict={e.type} />
      <div className="min-w-0">
        <span className="font-mono">{e.tool ?? ""}</span>
        {e.args && Object.keys(e.args).length > 0 && (
          <span className="ml-1 truncate font-mono text-muted-foreground">
            {JSON.stringify(e.args).slice(0, 120)}
          </span>
        )}
        {why && <div className="text-muted-foreground">{why}</div>}
      </div>
    </li>
  );
}
