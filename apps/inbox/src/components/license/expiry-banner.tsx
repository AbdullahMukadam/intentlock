"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { formatDate } from "@/lib/format";
import { daysUntilExpiry } from "@/lib/license";
import type { License } from "@/lib/schemas";

export function ExpiryBanner({ license }: { license: License }) {
  const days = daysUntilExpiry(license);
  if (days === null || !license.expiresAt) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-warning/10 px-4 py-2.5 text-sm md:px-6"
    >
      <CalendarClock className="size-4 shrink-0 text-warning" />
      <span>
        Your license expires on {formatDate(license.expiresAt)} (
        {days === 1 ? "tomorrow" : `in ${days} days`}).
      </span>
      <Link href="/license" className="font-medium underline-offset-4 hover:underline">
        Renew
      </Link>
    </div>
  );
}
