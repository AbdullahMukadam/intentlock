"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import Link from "next/link";

import { CreateAgentForm } from "@/components/agents/create-agent-form";
import { useMe } from "@/components/app-shell";
import Loader from "@/components/loader";
import { apiUrl } from "@/lib/api";
import { AgentViews } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";
import { can } from "@/lib/permissions";
import { UiAction } from "@/lib/enums/ui-action.enum";

const HEADERS = [
  "Agent",
  "Status",
  "Policy",
  "Active keys",
  "Allowed 24 h",
  "Blocked 24 h",
  "Held 24 h",
];

export function AgentList() {
  const me = useMe();
  const { data, error } = useApi(apiUrl(API_ENDPOINTS.AGENTS), AgentViews);

  return (
    <div className="grid gap-6">
      {can(me.role, UiAction.CREATE_AGENT) && <CreateAgentForm />}
      {error ? (
        <p className="text-sm text-destructive">Could not load agents.</p>
      ) : !data ? (
        <Loader />
      ) : (
        <div className="overflow-x-auto border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {HEADERS.map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td
                    colSpan={HEADERS.length}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No agents yet.
                  </td>
                </tr>
              )}
              {data.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      href={`/agents/${a.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {a.name}
                    </Link>
                    {a.description && (
                      <div className="text-xs text-muted-foreground">{a.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">{a.disabledAt ? "disabled" : "enabled"}</td>
                  <td className="px-3 py-2">{a.policyVersion ? `v${a.policyVersion}` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{a.activeKeys}</td>
                  <td className="px-3 py-2 tabular-nums">{a.last24h.allow}</td>
                  <td className="px-3 py-2 tabular-nums">{a.last24h.block}</td>
                  <td className="px-3 py-2 tabular-nums">{a.last24h.hold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
