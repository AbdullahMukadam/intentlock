"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Badge } from "@intentlock/ui/components/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intentlock/ui/components/tabs";
import { Input } from "@intentlock/ui/components/input";
import { FileCode, FlaskConical, History, ListChecks, Undo2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useMe } from "@/components/app-shell";
import Loader from "@/components/loader";
import { PolicyEditor } from "@/components/policy/policy-editor";
import { PolicyForm } from "@/components/policy/policy-form";
import { TestPanel } from "@/components/policy/test-panel";
import { VersionHistory } from "@/components/policy/version-history";
import { ApiError, api, apiUrl } from "@/lib/api";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { PolicyView } from "@/lib/enums/policy-view.enum";
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
  const [view, setView] = useState(PolicyView.FORM);
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

  const editing = view === PolicyView.FORM || view === PolicyView.YAML;

  return (
    <Tabs value={view} onValueChange={(v) => setView(v as PolicyView)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Policy" className="max-sm:w-full max-sm:[&_svg]:hidden">
          <TabsTrigger value={PolicyView.FORM}>
            <ListChecks /> Rules
          </TabsTrigger>
          <TabsTrigger value={PolicyView.YAML}>
            <FileCode /> YAML
          </TabsTrigger>
          {canTest && (
            <TabsTrigger value={PolicyView.TEST}>
              <FlaskConical /> Test
            </TabsTrigger>
          )}
          {versions.data && (
            <TabsTrigger value={PolicyView.HISTORY}>
              <History /> History
              <span className="text-xs text-muted-foreground tabular-nums">
                {versions.data.length}
              </span>
            </TabsTrigger>
          )}
        </TabsList>
        <div className="flex items-center gap-3">
          {dirty ? (
            <Badge tone="warning">Unpublished changes, based on v{baseVersion}</Badge>
          ) : (
            <Badge tone="success">Active v{active.version}</Badge>
          )}
          {isAdmin && dirty && (
            <Button variant="ghost" size="sm" onClick={discard}>
              <Undo2 /> Discard
            </Button>
          )}
        </div>
      </div>
      {!isAdmin && (
        <p className="text-xs text-muted-foreground">Read-only: only admins can change policies.</p>
      )}
      <TabsContent value={PolicyView.FORM}>
        <PolicyForm
          source={source}
          onChange={onChange}
          readOnly={!isAdmin}
          onOpenYaml={() => setView(PolicyView.YAML)}
        />
      </TabsContent>
      <TabsContent value={PolicyView.YAML} className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Errors are checked as you type. Publishing creates a new version; old versions never
            change.
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowChanges((s) => !s)}>
            {showChanges ? "Hide changes" : `Show changes vs v${active.version}`}
          </Button>
        </div>
        <PolicyEditor
          value={source}
          onChange={onChange}
          readOnly={!isAdmin}
          original={showChanges ? active.source : undefined}
        />
      </TabsContent>
      {canTest && (
        <TabsContent value={PolicyView.TEST} keepMounted>
          <TestPanel
            agentId={agentId}
            source={source}
            email={me.email}
            disabled={diagnostics.length > 0}
          />
        </TabsContent>
      )}
      {versions.data && (
        <TabsContent value={PolicyView.HISTORY}>
          <VersionHistory
            agentId={agentId}
            versions={versions.data}
            active={active}
            isAdmin={isAdmin}
            onChanged={reloadAll}
          />
        </TabsContent>
      )}
      {editing && diagnostics.length > 0 && (
        <ul
          className="grid gap-0.5 rounded-lg bg-destructive/8 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {diagnostics.map((d, i) => (
            <li key={i}>
              line {source.slice(0, d.from).split("\n").length}: {d.message}
            </li>
          ))}
        </ul>
      )}
      {editing && serverErrors.length > 0 && (
        <ul
          className="grid gap-0.5 rounded-lg bg-destructive/8 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {serverErrors.map((m, i) => (
            <li key={i}>Server: {m}</li>
          ))}
        </ul>
      )}
      {conflict !== null && (
        <div
          role="alert"
          className="grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p>
            v{conflict} was published while you were editing. Your text is kept. Rebase onto v
            {conflict}, review the changes, then publish again.
          </p>
          <Button size="sm" variant="outline" className="justify-self-start" onClick={rebase}>
            Rebase onto v{conflict}
          </Button>
        </div>
      )}
      {isAdmin && dirty && editing && (
        <div className="sticky bottom-4 z-10 flex items-center gap-2 rounded-xl border bg-card p-2 shadow-lg">
          <Input
            aria-label="Publish message"
            placeholder="What changed and why"
            value={message}
            maxLength={500}
            onChange={(e) => setMessage(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            onClick={publish}
            loading={busy}
            disabled={diagnostics.length > 0 || !message.trim() || conflict !== null}
          >
            {busy ? "Publishing…" : `Publish v${baseVersion + 1}`}
          </Button>
        </div>
      )}
    </Tabs>
  );
}
