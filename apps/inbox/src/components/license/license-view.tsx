"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button } from "@intentlock/ui/components/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import { Textarea } from "@intentlock/ui/components/textarea";
import { BadgeCheck, KeyRound, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useMe } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DetailGrid, DetailItem } from "@/components/detail-grid";
import { EmptyState } from "@/components/empty-state";
import { LimitWarning } from "@/components/license/limit-warning";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { LicenseEdition } from "@/lib/enums/license-edition.enum";
import { LicenseSource } from "@/lib/enums/license-source.enum";
import { LicenseStatus } from "@/lib/enums/license-status.enum";
import { UiAction } from "@/lib/enums/ui-action.enum";
import { errorMessage } from "@/lib/error-message";
import { formatDate } from "@/lib/format";
import { formatLimit, licenseUrl } from "@/lib/license";
import { can } from "@/lib/permissions";
import { License } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const PROBLEM: Partial<Record<LicenseStatus, string>> = {
  [LicenseStatus.INVALID]:
    "The license key could not be verified (it may have been changed), so the free limits apply.",
  [LicenseStatus.EXPIRED]: "The license key has expired, so the free limits apply.",
};

function ApplyKey({ license, onChange }: { license: License; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function apply(form: FormData) {
    setBusy(true);
    try {
      const applied = await api(API_ENDPOINTS.LICENSE, License, {
        method: HttpMethod.PUT,
        body: { key: form.get("key") },
      });
      toast.success(`License applied for ${applied.licensee}`);
      onChange();
    } catch (e) {
      toast.error(errorMessage(e, "Could not apply the license."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api(API_ENDPOINTS.LICENSE, z.undefined(), { method: HttpMethod.DELETE });
      toast.success("License removed");
      onChange();
    } catch (e) {
      toast.error(errorMessage(e, "Could not remove the license."));
    }
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <KeyRound />
          License key
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="grid gap-4">
        {license.source === LicenseSource.FILE ? (
          <p className="text-sm text-muted-foreground">
            This server reads its license from the file set in <code>LICENSE_FILE</code>. To change
            it, replace that file; the server picks it up within a minute.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Paste the key you received after buying. It is checked on the server before it is
              saved, and every server instance picks it up within a minute.
            </p>
            <form action={apply} className="grid gap-3">
              <Textarea
                name="key"
                aria-label="License key"
                placeholder="eyJhbGciOiJFZERTQSJ9…"
                required
                maxLength={8192}
                spellCheck={false}
                className="min-h-28 font-mono text-xs break-all"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={busy}>
                  {license.source === LicenseSource.DATABASE ? "Replace license" : "Apply license"}
                </Button>
                {license.source === LicenseSource.DATABASE && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmRemove(true)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </form>
          </>
        )}
      </PanelBody>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the license?"
        description="The install goes back to the free limits. Nobody is locked out and agents keep running, but no users or agents can be added past the free limits."
        confirmLabel="Remove license"
        onConfirm={remove}
      />
    </Panel>
  );
}

export function LicenseView() {
  const me = useMe();
  const { data: license, error, reload } = useApi(licenseUrl, License);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="License"
        description="Every feature is in every install. Without a license Intentlock runs with the free limits; a license, priced per seat per year, lifts them."
      />
      <LimitWarning />
      {error ? (
        <Panel>
          <PanelBody className="p-0">
            <EmptyState icon={TriangleAlert} title="Could not load the license" />
          </PanelBody>
        </Panel>
      ) : !license ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <Panel>
            <PanelHeader>
              <PanelTitle>
                <BadgeCheck />
                Current license
              </PanelTitle>
            </PanelHeader>
            <PanelBody className="grid gap-0 p-0">
              {PROBLEM[license.status] && (
                <p role="alert" className="flex gap-2 border-b px-4 py-3 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  {PROBLEM[license.status]}
                </p>
              )}
              <DetailGrid className="-mb-px">
                <DetailItem label="Mode">
                  {license.edition === LicenseEdition.FREE ? (
                    <Badge>Free</Badge>
                  ) : (
                    <Badge tone="success">Licensed</Badge>
                  )}
                </DetailItem>
                <DetailItem label="Licensed to">
                  {license.edition === LicenseEdition.FREE ? "—" : license.licensee}
                </DetailItem>
                <DetailItem label="Seats (active users)">
                  {formatLimit(license.usedUsers, license.maxUsers)}
                </DetailItem>
                <DetailItem label="Agents">
                  {formatLimit(license.usedAgents, license.maxAgents)}
                </DetailItem>
                <DetailItem label="Audit retention">{license.retentionDays} days</DetailItem>
                <DetailItem label="Expires">
                  {license.expiresAt ? formatDate(license.expiresAt) : "Never"}
                </DetailItem>
              </DetailGrid>
            </PanelBody>
          </Panel>
          {can(me.role, UiAction.MANAGE_LICENSE) && (
            <ApplyKey license={license} onChange={reload} />
          )}
        </>
      )}
    </div>
  );
}
