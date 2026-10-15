import { cn } from "@intentlock/ui/lib/utils";
import { ChevronDown } from "lucide-react";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pr-8 pl-3 text-[13px] shadow-xs outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
