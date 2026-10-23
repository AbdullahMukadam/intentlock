"use client";

import { Button } from "@intentlock/ui/components/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function SecretReveal({
  title,
  description,
  secret,
  onDone,
}: {
  title: string;
  description: string;
  secret: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="grid gap-3 rounded-xl border border-success/30 bg-success/8 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="w-full rounded-md border bg-card px-3 py-2 font-mono text-xs break-all sm:w-auto sm:min-w-0 sm:flex-1">
          {secret}
        </code>
        <Button
          variant="outline"
          onClick={() =>
            (
              navigator.clipboard?.writeText(secret) ?? Promise.reject(new Error("no clipboard"))
            ).then(
              () => setCopied(true),
              () => toast.error("Copy failed; select the text and copy it by hand."),
            )
          }
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
