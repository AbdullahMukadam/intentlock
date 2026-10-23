"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@intentlock/ui/components/card";
import { Input } from "@intentlock/ui/components/input";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useMe } from "@/components/app-shell";
import Loader from "@/components/loader";
import { PolicyEditor } from "@/components/policy/policy-editor";
import { TestPanel } from "@/components/policy/test-panel";
import { VersionHistory } from "@/components/policy/version-history";
import { ApiError, api, apiUrl } from "@/lib/api";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { policyDiagnostics } from "@/lib/policy-lint";
import {
  AgentPolicy,
  PolicyErrors,
  PolicyVersionSummaries,
  PolicyVersionView,
  StaleBaseVersion,
} from "@/lib/schemas";
import { useApi } from "@/lib/use-api";
import { can } from "@/lib/permissions";
import { UiAction } from "@/lib/enums/ui-action.enum";
import { errorMessage } from "@/lib/error-message";

export function PolicyPanel({ agentId }: { agentId: string }) {
  const me = useMe();
  const isAdmin = can(me.role, UiAction.EDIT_POLICY);
  const canTest = can(me.role, UiAction.TEST_POLICY);
  const policy = useApi(
    apiUrl(API_ENDPOINTS.AGENT_POLICY, { params: { id: agentId } }),
    AgentPolicy,
  );
  const versions = useApi(
    apiUrl(API_ENDPOINTS.AGENT_POLICY_VERSIONS, { params: { id: agentId } }),
    PolicyVersionSummaries,
  );
  const [edited, setEdited] = useState<string | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<number | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  const active = policy.data?.active;
  const activeVersion = active?.version;
  const onChange = useCallback(
    (value: string) => {
      setEdited(value);
      setBase((b) => b ?? activeVersion ?? null);
    },
    [activeVersion],
  );

  if (policy.error) return <p className="text-sm text-destructive">Could not load the policy.</p>;
  if (!active) return <Loader />;

  const source = edited ?? active.source;
  const baseVersion = base ?? active.version;
  const diagnostics = policyDiagnostics(source);
  const dirty = source !== active.source;

  function reloadAll() {
    policy.reload();
    versions.reload();
  }

  function discard() {
    setEdited(null);
    setBase(null);
    setConflict(null);
    setServerErrors([]);
  }

  function rebase() {
    setBase(null);
    setConflict(null);
    setShowChanges(true);
    policy.reload();
  }

  async function publish() {
    setBusy(true);
    setServerErrors([]);
    try {
      const created = await api(API_ENDPOINTS.AGENT_POLICY_PUBLISH, PolicyVersionView, {
        method: HttpMethod.POST,
        params: { id: agentId },
        body: { source, baseVersion, message: message.trim() },
      });
      toast.success(`Published v${created.version}`);
      setMessage("");
      discard();
      reloadAll();
    } catch (e) {
      if (e instanceof ApiError && e.code === ApiErrorCode.STALE_BASE_VERSION) {
        setConflict(StaleBaseVersion.safeParse(e.body).data?.activeVersion ?? null);
      } else if (e instanceof ApiError && e.code === ApiErrorCode.INVALID_POLICY) {
        const parsed = PolicyErrors.safeParse(e.body);
        setServerErrors(
          parsed.data?.errors.map((x) => `line ${x.line}: ${x.message}`) ?? ["Invalid policy."],
        );
      } else {
        toast.error(errorMessage(e, "Publish failed."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            {dirty ? `Editing (based on v${baseVersion})` : `Active policy v${active.version}`}
          </CardTitle>
          <CardDescription>
            {isAdmin
              ? "Errors are checked as you type. Publishing creates a new version; old versions never change."
              : "Read-only: only admins can change policies."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowChanges((s) => !s)}>
              {showChanges ? "Hide changes" : `Show changes vs v${active.version}`}
            </Button>
            {isAdmin && dirty && (
              <Button variant="ghost" size="sm" onClick={discard}>
                Discard edits
              </Button>
            )}
          </div>
          <PolicyEditor
            value={source}
            onChange={onChange}
            readOnly={!isAdmin}
            original={showChanges ? active.source : undefined}
          />
          {diagnostics.length > 0 && (
            <ul className="grid gap-0.5 text-xs text-destructive" role="alert">
              {diagnostics.map((d, i) => (
                <li key={i}>
                  line {source.slice(0, d.from).split("\n").length}: {d.message}
                </li>
              ))}
            </ul>
          )}
          {serverErrors.length > 0 && (
            <ul className="grid gap-0.5 text-xs text-destructive" role="alert">
              {serverErrors.map((m, i) => (
                <li key={i}>Server: {m}</li>
              ))}
            </ul>
          )}
          {conflict !== null && (
            <div role="alert" className="grid gap-2 border border-destructive p-3 text-sm">
              <p>
                v{conflict} was published while you were editing. Your text is kept. Rebase onto v
                {conflict}, review the changes, then publish again.
              </p>
              <Button size="sm" variant="outline" className="justify-self-start" onClick={rebase}>
                Rebase onto v{conflict}
              </Button>
            </div>
          )}
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Publish message"
                placeholder="What changed and why"
                value={message}
                maxLength={500}
                onChange={(e) => setMessage(e.target.value)}
                className="max-w-md"
              />
              <Button
                onClick={publish}
                loading={busy}
                disabled={!dirty || diagnostics.length > 0 || !message.trim() || conflict !== null}
              >
                {busy ? "Publishing…" : `Publish as v${baseVersion + 1}`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {canTest && (
        <TestPanel
          agentId={agentId}
          source={source}
          email={me.email}
          disabled={diagnostics.length > 0}
        />
      )}
      {versions.data && (
        <VersionHistory
          agentId={agentId}
          versions={versions.data}
          active={active}
          isAdmin={isAdmin}
          onChanged={reloadAll}
        />
      )}
    </div>
  );
}
