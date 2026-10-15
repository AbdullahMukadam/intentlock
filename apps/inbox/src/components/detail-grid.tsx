import { cn } from "@intentlock/ui/lib/utils";

export function DetailGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 overflow-hidden md:grid-cols-4 [&>div]:border-b [&>div]:p-4 [&>div:nth-child(odd)]:border-r md:[&>div]:border-r md:[&>div:nth-child(4n)]:border-r-0",
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
