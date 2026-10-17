"use client";

import { Button } from "@intentlock/ui/components/button";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export type RouteErrorProps = { error: Error & { digest?: string }; reset: () => void };

export function RouteError({ error, reset }: RouteErrorProps) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="This page hit a problem"
      description={
        <>
          Try again, or reload the page. If it keeps happening, tell your admin
          {error.digest ? ` and quote reference ${error.digest}` : ""}.
        </>
      }
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
