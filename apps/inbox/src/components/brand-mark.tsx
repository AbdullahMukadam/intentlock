import { cn } from "@intentlock/ui/lib/utils";
import { LockKeyhole } from "lucide-react";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs",
        className,
      )}
    >
      <LockKeyhole className="size-4" strokeWidth={2.25} />
    </span>
  );
}
