"use client";

import "../index.css";
import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function GlobalError(props: RouteErrorProps) {
  return (
    <html lang="en">
      <body className="flex min-h-svh items-center justify-center bg-background antialiased">
        <RouteError {...props} />
      </body>
    </html>
  );
}
