import { API_ENDPOINTS } from "@intentlock/core";
import { buttonVariants } from "@intentlock/ui/components/button";
import { cn } from "@intentlock/ui/lib/utils";

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
  const enabled = PROVIDERS.filter((p) => methods[p.id]);
  if (enabled.length === 0) return null;
  return (
    <div className="grid gap-2">
      {enabled.map(({ id, label, Icon }) => (
        <a
          key={id}
          href={providerHref(id, query)}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
        >
          <Icon className="size-4" />
          Continue with {label}
        </a>
      ))}
    </div>
  );
}
