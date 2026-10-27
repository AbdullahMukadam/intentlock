"use client";

import { Panel, PanelBody } from "@intentlock/ui/components/panel";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { licenseUrl, limitBreaches } from "@/lib/license";
import { License } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

export function LimitWarning({ linkToLicense = false }: { linkToLicense?: boolean }) {
  const { data: license } = useApi(licenseUrl, License);
  const breaches = license ? limitBreaches(license) : [];
  if (breaches.length === 0) return null;
  return (
    <Panel role="alert" className="border-warning/50">
      <PanelBody className="flex gap-3 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="grid gap-1">
          <p className="font-medium">This install is over its license limits</p>
          <p className="text-muted-foreground">
            {breaches.map((b) => `${b.used} active ${b.resource}, limit ${b.max}`).join("; ")}.
            Everything keeps working, but no more can be added until the team is back under the
            limits or a license is applied.{" "}
            {linkToLicense && (
              <Link
                href="/license"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Open License
              </Link>
            )}
          </p>
        </div>
      </PanelBody>
    </Panel>
  );
}
