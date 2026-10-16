import { cn } from "@intentlock/ui/lib/utils";
import * as React from "react";

function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn("bg-hatch flex min-w-0 flex-col rounded-xl border bg-panel p-1", className)}
      {...props}
    />
  );
}

function PanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="panel-header"
      className={cn("flex min-h-10 items-center justify-between gap-3 px-3 py-1.5", className)}
      {...props}
    />
  );
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="panel-title"
      className={cn(
        "flex items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function PanelCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="panel-count"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border bg-card px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

function PanelActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-body"
      className={cn("min-w-0 flex-1 rounded-lg border bg-card p-4 shadow-xs", className)}
      {...props}
    />
  );
}

export { Panel, PanelActions, PanelBody, PanelCount, PanelHeader, PanelTitle };
