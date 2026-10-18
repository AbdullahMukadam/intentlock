"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button, buttonVariants } from "@intentlock/ui/components/button";
import { cn } from "@intentlock/ui/lib/utils";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { api } from "@/lib/api";
import { LOGIN_PATH } from "@/lib/constants";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { errorMessage } from "@/lib/error-message";

import { AuthLayout } from "./auth-layout";
import { FormError, PasswordField } from "./form-field";

function message(error: unknown) {
  return errorMessage(error, "Could not reset the password.", {
    [ApiErrorCode.LINK_INVALID]: "This reset link is invalid, used or expired. Ask for a new one.",
    [ApiErrorCode.VALIDATION_FAILED]: "Use at least 12 characters.",
  });
}

export function ResetForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    if (form.get("password") !== form.get("confirm")) {
      setError("The two passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api(API_ENDPOINTS.AUTH_PASSWORD_RESET, z.unknown(), {
        method: HttpMethod.POST,
        body: { token, password: form.get("password") },
      });
      setDone(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <AuthLayout
        title="Password updated"
        description="You've been signed out everywhere. Sign in with your new password."
      >
        <div className="grid gap-4">
          <p className="flex items-center gap-2 text-[13px] text-success">
            <CircleCheck className="size-4" /> Your new password is set.
          </p>
          <a href={LOGIN_PATH} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            Sign in
          </a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" description="This link works once.">
      <form action={submit} className="grid gap-4">
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
          hint="At least 12 characters, not containing your email."
        />
        <PasswordField
          label="Confirm password"
          name="confirm"
          autoComplete="new-password"
          required
        />
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" loading={pending}>
          {pending ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
