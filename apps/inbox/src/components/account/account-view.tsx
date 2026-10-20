"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button, buttonVariants } from "@intentlock/ui/components/button";
import {
  Panel,
  PanelActions,
  PanelBody,
  PanelCount,
  PanelHeader,
  PanelTitle,
} from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@intentlock/ui/components/table";
import {
  Bell,
  CircleCheck,
  KeyRound,
  Laptop,
  LockKeyhole,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { FormError, PasswordField } from "@/components/auth/form-field";
import { providerHref } from "@/components/auth/provider-buttons";
import { GitHubIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { DetailGrid, DetailItem } from "@/components/detail-grid";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SecretReveal } from "@/components/secret-reveal";
import { api, apiUrl } from "@/lib/api";
import { oauthMessage } from "@/lib/auth-messages";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { OAuthMode } from "@/lib/enums/oauth-mode.enum";
import { SignInProvider } from "@/lib/enums/sign-in-provider.enum";
import { errorMessage } from "@/lib/error-message";
import { formatDate, formatRelative } from "@/lib/format";
import {
  type Account,
  Account as AccountSchema,
  AccountSessions,
  AuthMethods,
  CliToken,
} from "@/lib/schemas";
import { useApi } from "@/lib/use-api";
import { describeUserAgent } from "@/lib/user-agent";

const PROVIDERS = [
  { id: SignInProvider.GOOGLE, label: "Google", Icon: GoogleIcon },
  { id: SignInProvider.GITHUB, label: "GitHub", Icon: GitHubIcon },
] as const;

function passwordMessage(e: unknown) {
  return errorMessage(e, "Could not change the password.", {
    [ApiErrorCode.VALIDATION_FAILED]: "Use at least 12 characters.",
  });
}

function PasswordPanel({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);

  async function submit(form: FormData) {
    if (form.get("newPassword") !== form.get("confirm")) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(API_ENDPOINTS.ACCOUNT_PASSWORD, z.undefined(), {
        method: HttpMethod.POST,
        body: {
          ...(account.hasPassword && { currentPassword: form.get("currentPassword") }),
          newPassword: form.get("newPassword"),
        },
      });
      toast.success(
        account.hasPassword
          ? "Password changed. Your other sessions were signed out."
          : "Password set. You can now sign in with it.",
      );
      setFormKey((k) => k + 1);
      onChanged();
    } catch (e) {
      setError(passwordMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <LockKeyhole />
          {account.hasPassword ? "Change password" : "Set a password"}
        </PanelTitle>
      </PanelHeader>
      <PanelBody>
        <form key={formKey} action={submit} className="grid max-w-md gap-4">
          <input
            type="email"
            name="username"
            value={account.email}
            autoComplete="username"
            hidden
            readOnly
          />
          {account.hasPassword && (
            <PasswordField
              label="Current password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          )}
          <PasswordField
            label="New password"
            name="newPassword"
            autoComplete="new-password"
            minLength={12}
            required
            hint="At least 12 characters, not containing your email."
          />
          <PasswordField
            label="Confirm new password"
            name="confirm"
            autoComplete="new-password"
            required
          />
          <FormError>{error}</FormError>
          <div>
            <Button type="submit" loading={busy}>
              {busy ? "Saving…" : account.hasPassword ? "Change password" : "Set password"}
            </Button>
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}

function MethodsPanel({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const methods = useApi(apiUrl(API_ENDPOINTS.AUTH_METHODS), AuthMethods).data;
  const total = (account.hasPassword ? 1 : 0) + account.identities.length;

  const [unlinking, setUnlinking] = useState<SignInProvider | null>(null);

  async function unlink(provider: SignInProvider, label: string) {
    setUnlinking(provider);
    try {
      await api(API_ENDPOINTS.ACCOUNT_IDENTITY, z.undefined(), {
        method: HttpMethod.DELETE,
        params: { provider },
      });
      toast.success(`Unlinked ${label}`);
    } catch (e) {
      toast.error(errorMessage(e, `Could not unlink ${label}.`));
    }
    setUnlinking(null);
    onChanged();
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <ShieldCheck />
          Sign-in methods
          <PanelCount>{total}</PanelCount>
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="divide-y p-0">
        <div className="flex items-center gap-3 p-4">
          <span className="flex size-9 items-center justify-center rounded-lg border bg-panel">
            <KeyRound className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Password</div>
            <div className="text-xs text-muted-foreground">
              {account.hasPassword ? "Set" : "Not set: you sign in with a linked account"}
            </div>
          </div>
          {account.hasPassword ? <Badge tone="success">Active</Badge> : <Badge>Not set</Badge>}
        </div>
        {PROVIDERS.map(({ id, label, Icon }) => {
          const linked = account.identities.find((i) => i.provider === id);
          const enabled = methods?.[id] ?? false;
          return (
            <div key={id} className="flex items-center gap-3 p-4">
              <span className="flex size-9 items-center justify-center rounded-lg border bg-card">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {linked
                    ? `${linked.email} · linked ${formatDate(linked.createdAt)}`
                    : enabled
                      ? "Not linked"
                      : `Not available: the server has no ${label} client configured`}
                </div>
              </div>
              {linked ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={total <= 1}
                  title={total <= 1 ? "Your only sign-in method can't be removed" : undefined}
                  onClick={() => unlink(id, label)}
                  loading={unlinking === id}
                >
                  Unlink
                </Button>
              ) : enabled ? (
                <a
                  href={providerHref(id, { mode: OAuthMode.LINK })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Link {label}
                </a>
              ) : null}
            </div>
          );
        })}
      </PanelBody>
    </Panel>
  );
}

function SessionsPanel() {
  const { data, error, reload } = useApi(apiUrl(API_ENDPOINTS.ACCOUNT_SESSIONS), AccountSessions);
  const others = data?.filter((s) => !s.current).length ?? 0;

  const [signingOut, setSigningOut] = useState(false);

  async function signOutOthers() {
    setSigningOut(true);
    try {
      await api(API_ENDPOINTS.ACCOUNT_SESSIONS, z.undefined(), { method: HttpMethod.DELETE });
      toast.success("Signed out of your other sessions.");
    } catch (e) {
      toast.error(errorMessage(e, "Could not sign out the other sessions."));
    }
    setSigningOut(false);
    reload();
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Laptop />
          Active sessions
          {data && <PanelCount>{data.length}</PanelCount>}
        </PanelTitle>
        <PanelActions>
          <Button
            variant="outline"
            size="sm"
            disabled={others === 0}
            loading={signingOut}
            onClick={signOutOthers}
          >
            Sign out other sessions
          </Button>
        </PanelActions>
      </PanelHeader>
      <PanelBody className="overflow-hidden p-0">
        {error ? (
          <EmptyState icon={TriangleAlert} title="Could not load your sessions" className="py-8" />
        ) : !data ? (
          <div className="grid gap-2 p-4">
            <Skeleton className="h-10" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Device", "IP address", "Signed in", "Expires"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{describeUserAgent(s.userAgent)}</span>
                      {s.current && <Badge tone="success">This device</Badge>}
                    </span>
                  </TableCell>
                  <TableCell label="IP address" className="font-mono text-xs text-muted-foreground">
                    {s.ip ?? "—"}
                  </TableCell>
                  <TableCell label="Signed in" className="text-muted-foreground">
                    {formatRelative(s.createdAt)}
                  </TableCell>
                  <TableCell label="Expires" className="text-muted-foreground">
                    {formatRelative(s.expiresAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelBody>
    </Panel>
  );
}

function CliTokenPanel({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const res = await api(API_ENDPOINTS.ACCOUNT_CLI_TOKEN, CliToken, { method: HttpMethod.POST });
      setToken(res.token);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Could not create a CLI token."));
    }
    setCreating(false);
  }

  async function revoke() {
    setRevoking(true);
    try {
      await api(API_ENDPOINTS.ACCOUNT_CLI_TOKEN, z.undefined(), { method: HttpMethod.DELETE });
      toast.success("CLI token revoked.");
      setToken(null);
    } catch (e) {
      toast.error(errorMessage(e, "Could not revoke the CLI token."));
    }
    setRevoking(false);
    onChanged();
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Terminal />
          CLI token
        </PanelTitle>
        <PanelActions>
          {account.cliToken && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={revoke}
              loading={revoking}
              disabled={creating}
            >
              Revoke
            </Button>
          )}
          <Button size="sm" onClick={create} loading={creating} disabled={revoking}>
            {account.cliToken ? "Replace token" : "Create token"}
          </Button>
        </PanelActions>
      </PanelHeader>
      <PanelBody className="grid gap-4">
        {token && (
          <SecretReveal
            title="Copy your CLI token now"
            description="It is shown once and replaces any earlier token."
            secret={token}
            onDone={() => setToken(null)}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-[13px] text-muted-foreground">
            Lets the <code className="font-mono text-xs">intentlock</code> command line sign in as
            you, for scripts or if you sign in only with Google or GitHub.
          </p>
          {account.cliToken ? (
            <Badge tone="success">
              <CircleCheck /> Created {formatDate(account.cliToken.createdAt)}
            </Badge>
          ) : (
            <Badge>No token</Badge>
          )}
        </div>
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          intentlock login --url {origin}/api --email {account.email} --token
        </pre>
      </PanelBody>
    </Panel>
  );
}

function NotificationsPanel({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await api(API_ENDPOINTS.ACCOUNT, AccountSchema, {
        method: HttpMethod.PATCH,
        body: { holdEmails: !account.holdEmails },
      });
      toast.success(account.holdEmails ? "Hold emails turned off." : "Hold emails turned on.");
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Could not change hold emails."));
    }
    setBusy(false);
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Bell />
          Hold emails
        </PanelTitle>
        <PanelActions>
          <Button size="sm" variant="outline" onClick={toggle} loading={busy}>
            {account.holdEmails ? "Turn off" : "Turn on"}
          </Button>
        </PanelActions>
      </PanelHeader>
      <PanelBody className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-muted-foreground">
          Get an email when an agent's call is held and you may approve it. Turning this off does
          not change what you can approve.
        </p>
        {account.holdEmails ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
      </PanelBody>
    </Panel>
  );
}

export function AccountView({ linked, error }: { linked: string | null; error: string | null }) {
  const {
    data: account,
    error: loadError,
    reload,
  } = useApi(apiUrl(API_ENDPOINTS.ACCOUNT), AccountSchema);
  const notice = error ? oauthMessage(error) : null;
  const linkedLabel = PROVIDERS.find((p) => p.id === linked)?.label;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Account settings"
        description="Your profile, how you sign in, where you're signed in, and your command-line token."
      />
      {notice && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive"
        >
          <TriangleAlert className="size-4 shrink-0" /> {notice}
        </div>
      )}
      {linkedLabel && !notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/8 px-4 py-3 text-sm"
        >
          <CircleCheck className="size-4 shrink-0 text-success" /> {linkedLabel} is now linked. You
          can use it to sign in.
        </div>
      )}
      {loadError ? (
        <Panel>
          <PanelBody className="p-0">
            <EmptyState icon={TriangleAlert} title="Could not load your account" />
          </PanelBody>
        </Panel>
      ) : !account ? (
        <div className="grid gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          <Panel>
            <PanelHeader>
              <PanelTitle>
                <UserRound />
                Profile
              </PanelTitle>
            </PanelHeader>
            <PanelBody className="p-0">
              <DetailGrid columns={3} className="-mb-px">
                <DetailItem label="Email">{account.email}</DetailItem>
                <DetailItem label="Role">
                  <span className="capitalize">{account.role}</span>
                </DetailItem>
                <DetailItem label="Groups">
                  {account.groups.length ? account.groups.join(", ") : "—"}
                </DetailItem>
              </DetailGrid>
            </PanelBody>
          </Panel>
          <div className="grid gap-6 xl:grid-cols-2">
            <PasswordPanel account={account} onChanged={reload} />
            <MethodsPanel account={account} onChanged={reload} />
          </div>
          <NotificationsPanel account={account} onChanged={reload} />
          <SessionsPanel />
          <CliTokenPanel account={account} onChanged={reload} />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Your role and groups are set by an admin on the Team page.
      </p>
    </div>
  );
}
