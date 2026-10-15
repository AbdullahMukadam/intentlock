import { cn } from "@intentlock/ui/lib/utils";
import * as React from "react";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-[13px] max-sm:block", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted/60 max-sm:hidden [&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("max-sm:block [&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/35 max-sm:block max-sm:px-4 max-sm:py-2.5",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-4 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  label,
  ...props
}: React.ComponentProps<"td"> & { label?: string }) {
  return (
    <td
      data-slot="table-cell"
      data-label={label}
      className={cn(
        "h-12 px-4 align-middle whitespace-nowrap",
        "max-sm:flex max-sm:h-auto max-sm:min-h-8 max-sm:max-w-none max-sm:items-center max-sm:gap-4 max-sm:px-0 max-sm:py-1 max-sm:text-right max-sm:whitespace-normal max-sm:has-[>[data-empty]:only-child]:hidden",
        label
          ? "max-sm:justify-between max-sm:before:shrink-0 max-sm:before:text-left max-sm:before:text-xs max-sm:before:font-sans max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]"
          : "max-sm:justify-start max-sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
