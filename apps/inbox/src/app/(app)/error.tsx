"use client";

import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function AppError(props: RouteErrorProps) {
  return <RouteError {...props} />;
}
