"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";

import { apiUrl } from "@/lib/api";
import { TeamMembers } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

export function LabelBadge({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return (
    <Badge tone="violet" className="shrink-0 py-0 text-[11px]">
      {label}
    </Badge>
  );
}

export function MemberLabel({ email }: { email: string | null | undefined }) {
  const members = useApi(email ? apiUrl(API_ENDPOINTS.USERS) : null, TeamMembers).data;
  return <LabelBadge label={members?.find((m) => m.email === email)?.label} />;
}
