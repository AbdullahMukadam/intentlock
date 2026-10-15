import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import type { OAuthProviders } from "../../src/auth/oauth/utils/oauth-providers.util.js";

export type FakeAccount = { subject: string; email: string; verified: boolean };

type Grant = {
  provider: "google" | "github";
  account: FakeAccount;
  challenge: string;
  clientId: string;
  redirectUri: string;
  nonce: string | null;
};

const ISSUER = "https://fake-google.test";

async function body(req: IncomingMessage): Promise<URLSearchParams> {
  let raw = "";
  for await (const chunk of req) raw += String(chunk);
  return new URLSearchParams(raw);
}

export async function startFakeOAuth() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "fake", alg: "RS256", use: "sig" };
  const grants = new Map<string, Grant>();
  const tokens = new Map<string, FakeAccount>();
  let base = "";

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", base);
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (url.pathname === "/google/jwks") return json(200, { keys: [jwk] });

      if (req.method === "POST" && url.pathname.endsWith("/token")) {
        const form = await body(req);
        const code = form.get("code") ?? "";
        const grant = grants.get(code);
        grants.delete(code);
        const verifier = form.get("code_verifier") ?? "";
        const pkceOk =
          grant && createHash("sha256").update(verifier).digest("base64url") === grant.challenge;
        if (
          !grant ||
          !pkceOk ||
          form.get("client_id") !== grant.clientId ||
          form.get("redirect_uri") !== grant.redirectUri
        ) {
          return url.pathname.startsWith("/github")
            ? json(200, { error: "bad_verification_code" })
            : json(400, { error: "invalid_grant" });
        }
        if (grant.provider === "google") {
          const idToken = await new SignJWT({
            email: grant.account.email,
            email_verified: grant.account.verified,
            nonce: grant.nonce,
          })
            .setProtectedHeader({ alg: "RS256", kid: "fake" })
            .setIssuer(ISSUER)
            .setAudience(grant.clientId)
            .setSubject(grant.account.subject)
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(privateKey);
          return json(200, { id_token: idToken, access_token: "unused" });
        }
        const token = randomBytes(16).toString("hex");
        tokens.set(token, grant.account);
        return json(200, { access_token: token, token_type: "bearer" });
      }

      const account = tokens.get((req.headers.authorization ?? "").replace("Bearer ", ""));
      if (!account) return json(401, { message: "Bad credentials" });
      if (url.pathname === "/github/user") return json(200, { id: Number(account.subject) });
      if (url.pathname === "/github/user/emails") {
        return json(200, [
          { email: "old@elsewhere.dev", primary: false, verified: true },
          { email: account.email, primary: true, verified: account.verified },
        ]);
      }
      return json(404, {});
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const providers: OAuthProviders = {
    google: {
      clientId: "google-client",
      clientSecret: "google-secret",
      authorizeUrl: `${base}/google/authorize`,
      tokenUrl: `${base}/google/token`,
      scope: "openid email",
      issuer: [ISSUER],
      jwksUrl: `${base}/google/jwks`,
    },
    github: {
      clientId: "github-client",
      clientSecret: "github-secret",
      authorizeUrl: `${base}/github/authorize`,
      tokenUrl: `${base}/github/token`,
      scope: "read:user user:email",
      apiUrl: `${base}/github`,
    },
  };

  function authorize(location: string, account: FakeAccount) {
    const url = new URL(location);
    const code = randomBytes(16).toString("hex");
    grants.set(code, {
      provider: url.pathname.startsWith("/google") ? "google" : "github",
      account,
      challenge: url.searchParams.get("code_challenge") ?? "",
      clientId: url.searchParams.get("client_id") ?? "",
      redirectUri: url.searchParams.get("redirect_uri") ?? "",
      nonce: url.searchParams.get("nonce"),
    });
    return { code, state: url.searchParams.get("state") ?? "" };
  }

  return {
    providers,
    authorize,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
