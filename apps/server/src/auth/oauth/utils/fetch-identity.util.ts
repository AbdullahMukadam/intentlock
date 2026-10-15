import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";

import { IdentityProvider } from "../../../generated/prisma/client.js";
import type { OAuthProviderConfig } from "../types/oauth-provider-config.type.js";
import type { ProviderIdentity } from "../types/provider-identity.type.js";

const TIMEOUT_MS = 10_000;

const GoogleToken = z.object({ id_token: z.string() });
const GoogleClaims = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  nonce: z.string().optional(),
});
const GithubToken = z.object({ access_token: z.string() });
const GithubUser = z.object({ id: z.number() });
const GithubEmails = z.array(
  z.object({ email: z.string().email(), primary: z.boolean(), verified: z.boolean() }),
);

const jwksCache = new Map<string, JWTVerifyGetKey>();

async function getJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function exchangeCode(
  config: OAuthProviderConfig,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<unknown> {
  return getJson(config.tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
}

async function google(
  config: OAuthProviderConfig,
  tokens: unknown,
  nonce: string,
): Promise<ProviderIdentity> {
  const { id_token } = GoogleToken.parse(tokens);
  const jwksUrl = config.jwksUrl!;
  let jwks = jwksCache.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, jwks);
  }
  const { payload } = await jwtVerify(id_token, jwks, {
    issuer: config.issuer!,
    audience: config.clientId,
  });
  const claims = GoogleClaims.parse(payload);
  if (claims.nonce !== nonce) throw new Error("nonce mismatch");
  return {
    subject: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true,
  };
}

async function github(config: OAuthProviderConfig, tokens: unknown): Promise<ProviderIdentity> {
  const { access_token } = GithubToken.parse(tokens);
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${access_token}`,
    "User-Agent": "intentlock",
  };
  const user = GithubUser.parse(await getJson(`${config.apiUrl}/user`, { headers }));
  const emails = GithubEmails.parse(await getJson(`${config.apiUrl}/user/emails`, { headers }));
  const primary = emails.find((e) => e.primary);
  return {
    subject: String(user.id),
    email: (primary?.email ?? "").toLowerCase(),
    emailVerified: primary?.verified === true,
  };
}

export async function fetchIdentity(
  provider: IdentityProvider,
  config: OAuthProviderConfig,
  input: { code: string; verifier: string; nonce: string; redirectUri: string },
): Promise<ProviderIdentity> {
  const tokens = await exchangeCode(config, input.code, input.verifier, input.redirectUri);
  return provider === IdentityProvider.google
    ? google(config, tokens, input.nonce)
    : github(config, tokens);
}
