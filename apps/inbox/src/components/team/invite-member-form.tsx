"use client";

import { API_ENDPOINTS, Role } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Label } from "@intentlock/ui/components/label";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { UserPlus } from "lucide-react";
import { useId, useState } from "react";

import { FormError, FormField } from "@/components/auth/form-field";
import { NativeSelect } from "@/components/native-select";
import { api } from "@/lib/api";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { errorMessage } from "@/lib/error-message";
import { parseGroups } from "@/lib/format";
import { InviteCreated } from "@/lib/schemas";

function message(error: unknown) {
  return errorMessage(error, "Could not create the invite.", {
    [ApiErrorCode.VALIDATION_FAILED]:
      "Check the email and groups (lowercase letters, digits, - and _).",
  });
}

export function InviteMemberForm({
  onInvited,
  onCancel,
}: {
  onInvited: (result: { email: string; link: string; emailed: boolean }) => void;
  onCancel: () => void;
}) {
  const roleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await api(API_ENDPOINTS.INVITES, InviteCreated, {
        method: HttpMethod.POST,
        body: {
          email: form.get("email"),
          role: form.get("role"),
          groups: parseGroups(String(form.get("groups") ?? "")),
        },
      });
      onInvited({ email: res.invite.email, link: res.link, emailed: res.emailed });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <UserPlus />
          Invite a teammate
        </PanelTitle>
      </PanelHeader>
      <PanelBody>
        <form action={submit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)]">
            <FormField
              label="Email"
              name="email"
              type="email"
              placeholder="alice@acme.dev"
              required
              autoFocus
            />
            <div className="grid gap-1.5">
              <Label htmlFor={roleId}>Role</Label>
              <NativeSelect
                id={roleId}
                name="role"
                defaultValue={Role.enum.member}
                className="w-full"
              >
                {Role.options.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <FormField
              label="Groups"
              name="groups"
              placeholder="oncall, support-leads"
              hint="Optional, comma-separated; used in policy rules"
            />
          </div>
          <FormError>{error}</FormError>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Admins manage everything, approvers approve holds, members see their own runs. The
              link is valid for 7 days and works once.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Inviting…" : "Create invite"}
              </Button>
            </div>
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
