"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { cn } from "@intentlock/ui/lib/utils";
import { Database, Download, Terminal, TriangleAlert } from "lucide-react";

import { useMe } from "@/components/app-shell";
import { VerifyButton } from "@/components/audit/verify-button";
import { CodeBlock } from "@/components/code-block";
import { DetailGrid, DetailItem } from "@/components/detail-grid";
import { EmptyState } from "@/components/empty-state";
import { LimitWarning } from "@/components/license/limit-warning";
import { PageHeader } from "@/components/page-header";
import { apiUrl } from "@/lib/api";
import { auditSummaryUrl } from "@/lib/audit-verify";
import { AuditFormat } from "@/lib/enums/audit-format.enum";
import { UiAction } from "@/lib/enums/ui-action.enum";
import { formatDate, formatRelative, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { AuditSummary } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const EXPORT_FILE = "intentlock-audit.jsonl";
const VERIFY_COMMAND = `npx -y @intentlock/cli audit verify --file ${EXPORT_FILE}`;
const exportUrl = apiUrl(API_ENDPOINTS.AUDIT, { query: { format: AuditFormat.JSONL } });

function Sub({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("block truncate text-xs font-normal text-muted-foreground", className)}>
      {children}
    </span>
  );
}

function ChainSummary() {
  const { data: s, error } = useApi(auditSummaryUrl, AuditSummary);
  const last = s?.lastVerified;
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Database />
          Chain
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="p-0">
        {error ? (
          <EmptyState
            icon={TriangleAlert}
            title="Could not load the chain summary"
            description="The server did not answer. Reload the page in a moment."
          />
        ) : (
          <DetailGrid columns={3} className="-mb-px">
            <DetailItem label="Entries">{s ? s.count.toLocaleString() : "—"}</DetailItem>
            <DetailItem label="Head">
              {s?.head ? (
                <>
                  <span className="font-mono">#{s.head.seq}</span>
                  <Sub className="font-mono">
                    <span title={s.head.hash}>{s.head.hash.slice(0, 16)}…</span>
                  </Sub>
                </>
              ) : (
                "—"
              )}
            </DetailItem>
            <DetailItem label="Last entry">
              {s?.head ? (
                <>
                  {formatRelative(s.head.at)}
                  <Sub>{formatTime(s.head.at)}</Sub>
                </>
              ) : (
                "—"
              )}
            </DetailItem>
            <DetailItem label="Oldest entry kept">
              {s?.oldest ? (
                <>
                  <span className="font-mono">#{s.oldest.seq}</span>
                  <Sub>{formatDate(s.oldest.at)}</Sub>
                </>
              ) : (
                "—"
              )}
            </DetailItem>
            <DetailItem label="History shown">
              {s ? (
                <>
                  Last {s.retentionDays} days
                  <Sub>Older entries are kept and still verified.</Sub>
                </>
              ) : (
                "—"
              )}
            </DetailItem>
            <DetailItem label="Last verified">
              {last ? (
                <>
                  <span className={last.ok ? "text-success" : "text-destructive"}>
                    {last.ok ? "Intact" : `Broken at #${last.firstBrokenSeq}`}
                  </span>{" "}
                  {formatRelative(last.at)}
                  <Sub>by {last.email}</Sub>
                </>
              ) : s ? (
                "Never"
              ) : (
                "—"
              )}
            </DetailItem>
          </DetailGrid>
        )}
      </PanelBody>
    </Panel>
  );
}

function OfflineVerify() {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Terminal />
          Verify offline
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Export the whole chain, then check it on any machine with the CLI. It recomputes every
          hash without talking to this server.
        </p>
        <CodeBlock label="Terminal" code={VERIFY_COMMAND} />
      </PanelBody>
    </Panel>
  );
}

export function AuditView() {
  const me = useMe();
  const canExport = can(me.role, UiAction.EXPORT_AUDIT_CHAIN);
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Audit"
        description="Every decision, approval and admin change is appended to one hash chain. Verify it here, or export it and verify offline with the CLI."
        actions={
          canExport && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={exportUrl} download={EXPORT_FILE} />}
            >
              <Download />
              Export chain
            </Button>
          )
        }
      />
      <LimitWarning linkToLicense />
      <ChainSummary />
      <VerifyButton />
      {canExport && <OfflineVerify />}
    </div>
  );
}
