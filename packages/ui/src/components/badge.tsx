import { cn } from "@intentlock/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 text-[13px] whitespace-nowrap text-foreground [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "text-muted-foreground",
        success: "before:size-1.5 before:rounded-full before:bg-success",
        warning: "before:size-1.5 before:rounded-full before:bg-warning",
        danger: "before:size-1.5 before:rounded-full before:bg-destructive",
        info: "before:size-1.5 before:rounded-full before:bg-info",
        violet: "before:size-1.5 before:rounded-full before:bg-violet",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, type BadgeTone, badgeVariants };
