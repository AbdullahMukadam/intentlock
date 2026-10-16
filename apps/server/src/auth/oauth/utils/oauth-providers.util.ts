import type { Env } from "../../../config/env.schema.js";
import { IdentityProvider } from "../../../generated/prisma/client.js";
import type { OAuthProviderConfig } from "../types/oauth-provider-config.type.js";

export type OAuthProviders = Record<IdentityProvider, OAuthProviderConfig | null>;

export function oauthProvidersFromEnv(env: Env): OAuthProviders {
  return {
    [IdentityProvider.google]:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
            tokenUrl: "https://oauth2.googleapis.com/token",
            scope: "openid email",
            issuer: ["https://accounts.google.com", "accounts.google.com"],
            jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
          }
        : null,
    [IdentityProvider.github]:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            authorizeUrl: "https://github.com/login/oauth/authorize",
            tokenUrl: "https://github.com/login/oauth/access_token",
            scope: "read:user user:email",
            apiUrl: "https://api.github.com",
          }
        : null,
  };
}
