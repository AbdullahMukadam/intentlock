"use client";

import { Button } from "@intentlock/ui/components/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between border-b bg-card px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            navigator.clipboard.writeText(code).then(
              () => setCopied(true),
              () => toast.error("Copy failed; select the text and copy it by hand."),
            )
          }
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">{code}</pre>
    </div>
  );
}
