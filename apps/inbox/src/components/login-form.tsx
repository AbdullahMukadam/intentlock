"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Divider, FormError, FormField, PasswordField } from "@/components/auth/form-field";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { ApiError, api, safeNext } from "@/lib/api";
import { oauthMessage } from "@/lib/auth-messages";
import { SETUP_PATH } from "@/lib/constants";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { HttpStatus } from "@/lib/enums/http-status.enum";
import { errorMessage } from "@/lib/error-message";
import { AuthMethods, LoginResponse, SetupStatus } from "@/lib/schemas";

function message(error: unknown) {
  if (error instanceof ApiError && error.status === HttpStatus.UNAUTHORIZED)
    return "Wrong email or password.";
  return errorMessage(error, "Sign-in failed.");
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    try {
      await api(API_ENDPOINTS.AUTH_PASSWORD_FORGOT, z.unknown(), {
        method: HttpMethod.POST,
        body: { email: form.get("email") },
      });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e, "Could not send the email. Ask an admin for a reset link."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      {sent ? (
        <p role="status" className="rounded-lg border bg-muted/50 px-3 py-2.5 text-[13px]">
          If that email has an account, a reset link is on its way. It works for one hour.
        </p>
      ) : (
        <form action={submit} className="grid gap-4">
          <FormField label="Email" name="email" type="email" autoComplete="username" required />
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <Button variant="ghost" onClick={onBack}>
        Back to sign in
      </Button>
    </div>
  );
}

export function LoginForm({
  next,
  error: oauthError,
}: {
  next: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [error, setError] = useState<string | null>(oauthMessage(oauthError));
  const [pending, setPending] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    api(API_ENDPOINTS.SETUP_STATUS, SetupStatus).then(
      (s) => s.setupRequired && router.replace(SETUP_PATH),
      () => undefined,
    );
    api(API_ENDPOINTS.AUTH_METHODS, AuthMethods).then(setMethods, () => undefined);
  }, [router]);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    try {
      await api(API_ENDPOINTS.AUTH_LOGIN, LoginResponse, {
        method: HttpMethod.POST,
        body: { email: form.get("email"), password: form.get("password") },
      });
      window.location.assign(safeNext(next));
    } catch (e) {
      setError(message(e));
      setPending(false);
    }
  }

  if (forgot) {
    return (
      <AuthLayout
        title="Reset your password"
        description="We'll email you a link to choose a new password."
      >
        <ForgotForm onBack={() => setForgot(false)} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to review held actions and your agents' activity."
      footer="No account? Ask an admin of your team for an invite."
    >
      <div className="grid gap-5">
        {methods && <ProviderButtons methods={methods} />}
        {methods && (methods.google || methods.github) && <Divider>or with email</Divider>}
        <form action={submit} className="grid gap-4">
          <FormField label="Email" name="email" type="email" autoComplete="username" required />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            aside={
              methods?.passwordReset && (
                <button
                  type="button"
                  onClick={() => setForgot(true)}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot password?
                </button>
              )
            }
          />
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
