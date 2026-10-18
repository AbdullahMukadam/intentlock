"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button, buttonVariants } from "@intentlock/ui/components/button";
import { useEffect, useState } from "react";

import Loader from "@/components/loader";
import { api } from "@/lib/api";
import { LOGIN_PATH } from "@/lib/constants";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { OAuthMode } from "@/lib/enums/oauth-mode.enum";
import { errorMessage } from "@/lib/error-message";
import { formatDate } from "@/lib/format";
import { AuthMethods, InviteInfo, LoginResponse } from "@/lib/schemas";

import { AuthLayout } from "./auth-layout";
import { Divider, FormError, PasswordField } from "./form-field";
import { ProviderButtons } from "./provider-buttons";

function message(error: unknown) {
  return errorMessage(error, "Could not accept the invite.", {
    [ApiErrorCode.VALIDATION_FAILED]: "Use at least 12 characters.",
    [ApiErrorCode.LINK_INVALID]: "This invite is no longer valid.",
  });
}

export function InviteForm({ token, error: oauthError }: { token: string; error: string | null }) {
  const [invite, setInvite] = useState<InviteInfo | null | undefined>(undefined);
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [error, setError] = useState<string | null>(oauthError);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api(API_ENDPOINTS.INVITE_LOOKUP, InviteInfo, { method: HttpMethod.POST, body: { token } }).then(
      setInvite,
      () => setInvite(null),
    );
    api(API_ENDPOINTS.AUTH_METHODS, AuthMethods).then(setMethods, () => undefined);
  }, [token]);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    try {
      await api(API_ENDPOINTS.INVITE_ACCEPT, LoginResponse, {
        method: HttpMethod.POST,
        body: { token, password: form.get("password") },
      });
      window.location.assign("/");
    } catch (e) {
      setError(message(e));
      setPending(false);
    }
  }

  if (invite === undefined) return <Loader />;

  if (invite === null) {
    return (
      <AuthLayout
        title="This invite can't be used"
        description="The link is invalid, already used, revoked or expired. Ask an admin of your team to send a new one."
      >
        <a
          href={LOGIN_PATH}
          className={buttonVariants({ variant: "outline", size: "lg" }) + " w-full"}
        >
          Go to sign in
        </a>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${invite.orgName}`}
      description={`You've been invited to Intentlock. The invite expires ${formatDate(invite.expiresAt)}.`}
    >
      <div className="grid gap-5">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
          <span className="min-w-0 truncate text-[13px] font-medium">{invite.email}</span>
          <Badge tone="info" className="capitalize">
            {invite.role}
          </Badge>
        </div>
        {methods && (
          <ProviderButtons methods={methods} query={{ mode: OAuthMode.INVITE, invite: token }} />
        )}
        {methods && (methods.google || methods.github) && <Divider>or set a password</Divider>}
        <form action={submit} className="grid gap-4">
          <input
            type="email"
            name="username"
            value={invite.email}
            autoComplete="username"
            hidden
            readOnly
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            minLength={12}
            required
            hint="At least 12 characters, not containing your email."
          />
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" loading={pending}>
            {pending ? "Joining…" : "Create account"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
