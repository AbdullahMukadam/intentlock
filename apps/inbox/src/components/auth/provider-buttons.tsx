"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { buttonVariants } from "@intentlock/ui/components/button";
import { cn } from "@intentlock/ui/lib/utils";
import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { apiUrl } from "@/lib/api";
import { SignInProvider } from "@/lib/enums/sign-in-provider.enum";
import type { AuthMethods } from "@/lib/schemas";

import { GitHubIcon, GoogleIcon } from "./provider-icons";

const PROVIDERS = [
  { id: SignInProvider.GOOGLE, label: "Google", Icon: GoogleIcon },
  { id: SignInProvider.GITHUB, label: "GitHub", Icon: GitHubIcon },
] as const;

export function providerHref(provider: SignInProvider, query: Record<string, string> = {}) {
  return apiUrl(API_ENDPOINTS.AUTH_OAUTH_START, { params: { provider }, query });
}

export function ProviderButtons({
  methods,
  query,
}: {
  methods: AuthMethods;
  query?: Record<string, string>;
}) {
  const [opening, setOpening] = useState<SignInProvider | null>(null);
  useEffect(() => {
    const reset = () => setOpening(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const enabled = PROVIDERS.filter((p) => methods[p.id]);
  if (enabled.length === 0) return null;
  return (
    <div className="grid gap-2">
      {enabled.map(({ id, label, Icon }) => (
        <a
          key={id}
          href={providerHref(id, query)}
          onClick={(e) => (opening ? e.preventDefault() : setOpening(id))}
          aria-busy={opening === id || undefined}
          aria-disabled={(opening !== null && opening !== id) || undefined}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full",
            opening && "cursor-default",
            opening !== null && opening !== id && "opacity-50",
          )}
        >
          {opening === id ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Icon className="size-4" />
          )}
          Continue with {label}
        </a>
      ))}
    </div>
  );
}
