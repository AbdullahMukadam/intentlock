import type { IdentityProvider } from "../../../generated/prisma/client.js";
import type { OAuthMode } from "../enums/oauth-mode.enum.js";

export type OAuthState = {
  provider: IdentityProvider;
  state: string;
  nonce: string;
  verifier: string;
  mode: OAuthMode;
  invite?: string | undefined;
};
