"use client";

import { Input } from "@intentlock/ui/components/input";
import { Label } from "@intentlock/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

type FieldProps = Omit<React.ComponentProps<typeof Input>, "id"> & {
  label: string;
  hint?: React.ReactNode;
  aside?: React.ReactNode;
};

export function FormField({ label, hint, aside, ...input }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <Input id={id} aria-describedby={hint ? hintId : undefined} {...input} />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ label, hint, aside, ...input }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          className="pr-10"
          aria-describedby={hint ? hintId : undefined}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-[13px] text-destructive"
    >
      {children}
    </p>
  );
}

export function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
