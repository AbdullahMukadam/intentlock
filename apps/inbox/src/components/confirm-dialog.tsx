"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@intentlock/ui/components/alert-dialog";
import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import { useState } from "react";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  confirmText,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  confirmText?: string;
  onConfirm: (form: FormData) => Promise<void>;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = confirmText === undefined || typed === confirmText;

  function change(next: boolean) {
    if (busy) return;
    if (!next) setTyped("");
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    try {
      await onConfirm(new FormData(e.currentTarget));
    } finally {
      setBusy(false);
      setTyped("");
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {children}
          {confirmText !== undefined && (
            <label className="grid gap-1.5">
              <span>
                Type <span className="font-mono font-medium">{confirmText}</span> to confirm
              </span>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-label={`Type ${confirmText} to confirm`}
              />
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" disabled={busy} />}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              loading={busy}
              disabled={!matches}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
