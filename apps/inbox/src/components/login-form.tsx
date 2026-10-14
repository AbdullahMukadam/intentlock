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
import { Label } from "@intentlock/ui/components/label";
import { useState } from "react";

import { ApiError, api, safeNext } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { HttpStatus } from "@/lib/enums/http-status.enum";
import { LoginResponse } from "@/lib/schemas";

function message(error: unknown) {
  if (error instanceof ApiError && error.status === HttpStatus.UNAUTHORIZED)
    return "Wrong email or login token.";
  if (error instanceof ApiError && error.status === HttpStatus.TOO_MANY_REQUESTS)
    return "Too many attempts. Try again in a minute.";
  return "Sign-in failed. Is the server running?";
}

export function LoginForm({ next }: { next: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    try {
      await api(API_ENDPOINTS.AUTH_LOGIN, LoginResponse, {
        method: HttpMethod.POST,
        body: { email: form.get("email"), token: form.get("token") },
      });
      window.location.assign(safeNext(next));
    } catch (e) {
      setError(message(e));
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in to Intentlock</CardTitle>
        <CardDescription>Use your email and the login token your admin gave you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="token">Login token</Label>
            <Input
              id="token"
              name="token"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
