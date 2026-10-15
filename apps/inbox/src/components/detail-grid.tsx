import { cn } from "@intentlock/ui/lib/utils";

const COLUMNS = {
  3: "md:grid-cols-3 md:[&>div:nth-child(3n)]:border-r-0",
  4: "md:grid-cols-4 md:[&>div:nth-child(4n)]:border-r-0",
} as const;

export function DetailGrid({
  className,
  columns = 4,
  children,
}: {
  className?: string;
  columns?: keyof typeof COLUMNS;
  children: React.ReactNode;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 overflow-hidden [&>div]:border-b [&>div]:p-4 [&>div:nth-child(odd)]:border-r md:[&>div]:border-r",
        COLUMNS[columns],
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-[13px] font-medium">{children}</dd>
    </div>
  );
}
