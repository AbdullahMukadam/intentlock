import { OAuthErrorCode } from "./enums/oauth-error-code.enum";

const OAUTH_MESSAGES: Record<OAuthErrorCode, string> = {
  [OAuthErrorCode.OAUTH_CANCELLED]: "Sign-in was cancelled.",
  [OAuthErrorCode.OAUTH_FAILED]: "Sign-in with that provider failed. Try again.",
  [OAuthErrorCode.NO_ACCOUNT]:
    "There is no Intentlock account for that email. Ask an admin to invite you.",
  [OAuthErrorCode.EMAIL_NOT_VERIFIED]: "That account's email address is not verified.",
  [OAuthErrorCode.INVITE_INVALID]: "This invite is invalid, used or expired.",
  [OAuthErrorCode.INVITE_EMAIL_MISMATCH]:
    "That account's email is not the invited one. Use the invited address.",
  [OAuthErrorCode.IDENTITY_IN_USE]: "That account is already linked to another person.",
  [OAuthErrorCode.ALREADY_LINKED]: "A different account from that provider is already linked.",
  [OAuthErrorCode.NOT_SIGNED_IN]: "Sign in first, then link the account from settings.",
  [OAuthErrorCode.USER_LIMIT_REACHED]:
    "Your team has reached its user limit. Ask an admin to free a seat.",
};

export function oauthMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return (
    (OAUTH_MESSAGES as Record<string, string | undefined>)[code] ?? "Sign-in failed. Try again."
  );
}
