"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import Loader from "@/components/loader";
import { ApiError, api } from "@/lib/api";
import { LOGIN_PATH, ONBOARDING_PATH } from "@/lib/constants";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { errorMessage } from "@/lib/error-message";
import { LoginResponse, SetupStatus } from "@/lib/schemas";

import { AuthLayout } from "./auth-layout";
import { FormError, FormField, PasswordField } from "./form-field";

function message(error: unknown) {
  return errorMessage(error, "Setup failed.", {
    [ApiErrorCode.INVALID_SETUP_CODE]:
      "That setup code is not valid. Use the newest code in the server logs.",
    [ApiErrorCode.VALIDATION_FAILED]:
      "Check the fields: a valid email and a password of at least 12 characters.",
  });
}

export function SetupForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api(API_ENDPOINTS.SETUP_STATUS, SetupStatus).then(
      (s) => (s.setupRequired ? setReady(true) : router.replace(LOGIN_PATH)),
      () => setReady(true),
    );
  }, [router]);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    try {
      await api(API_ENDPOINTS.SETUP, LoginResponse, {
        method: HttpMethod.POST,
        body: {
          code: String(form.get("code") ?? "").trim(),
          orgName: String(form.get("orgName") ?? "").trim() || undefined,
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      window.location.assign(ONBOARDING_PATH);
    } catch (e) {
      if (e instanceof ApiError && e.code === ApiErrorCode.SETUP_COMPLETE) {
        router.replace(LOGIN_PATH);
        return;
      }
      setError(message(e));
      setPending(false);
    }
  }

  if (!ready) return <Loader />;

  return (
    <AuthLayout
      title="Set up Intentlock"
      description="Create the first admin account for your team. You'll invite everyone else from inside."
    >
      <form action={submit} className="grid gap-4">
        <FormField
          label="Setup code"
          name="code"
          autoComplete="off"
          spellCheck={false}
          required
          className="font-mono text-[13px]"
          hint={
            <>
              Printed once by the server on first start:{" "}
              <code className="font-mono">docker compose logs server | grep "setup code"</code>
            </>
          }
        />
        <FormField
          label="Team name"
          name="orgName"
          placeholder="Acme"
          autoComplete="organization"
        />
        <FormField label="Your email" name="email" type="email" autoComplete="username" required />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
          hint="At least 12 characters, not containing your email."
        />
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating your account…" : "Create admin account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
