export type OAuthProviderConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  issuer?: string[];
  jwksUrl?: string;
  apiUrl?: string;
};
