import { ApiError } from "./api";
import { ApiErrorCode } from "./enums/api-error-code.enum";
import { HttpStatus } from "./enums/http-status.enum";

const SHARED: Partial<Record<string, string>> = {
  [ApiErrorCode.PASSWORD_TOO_WEAK]: "Choose a password that does not contain your email.",
  [ApiErrorCode.USER_LIMIT_REACHED]:
    "Your team has reached its user limit. An admin can free a seat or apply a license on the License page.",
  [ApiErrorCode.AGENT_NAME_TAKEN]: "An agent with that name already exists.",
  [ApiErrorCode.AGENT_LIMIT_REACHED]:
    "Your team has reached its agent limit. An admin can delete an agent or apply a license on the License page.",
  [ApiErrorCode.LICENSE_INVALID]:
    "That license key is not valid. Paste the whole key you received.",
  [ApiErrorCode.LICENSE_EXPIRED]: "That license key has expired.",
  [ApiErrorCode.LICENSE_FROM_FILE]:
    "This server reads its license from LICENSE_FILE. Change that file instead.",
  [ApiErrorCode.HOLD_NOT_PENDING]: "Someone else resolved this hold, or it expired.",
  [ApiErrorCode.NOT_AN_APPROVER]: "You are not an approver for this hold.",
  [ApiErrorCode.USER_EXISTS]: "That person is already on the team.",
  [ApiErrorCode.INVITE_EXISTS]:
    "There is already a pending invite for that email. Resend it from the list below.",
  [ApiErrorCode.WRONG_PASSWORD]: "Your current password is not right.",
  [ApiErrorCode.LAST_SIGN_IN_METHOD]:
    "Set a password or link another account first: this is your only way to sign in.",
  [ApiErrorCode.CANNOT_DEMOTE_OR_DISABLE_SELF]:
    "You cannot change your own role or disable yourself.",
  [ApiErrorCode.DATABASE_UNAVAILABLE]:
    "The server cannot reach its database right now. Try again in a moment.",
};

function requestIdOf(error: ApiError): string | null {
  const body = error.body as { requestId?: unknown } | undefined;
  return typeof body?.requestId === "string" ? body.requestId : null;
}

export function errorMessage(
  error: unknown,
  fallback: string,
  overrides: Partial<Record<string, string>> = {},
): string {
  if (!(error instanceof ApiError)) return `${fallback} Can't reach the server.`;
  const known = overrides[error.code] ?? SHARED[error.code];
  if (known) return known;
  if (error.status === HttpStatus.TOO_MANY_REQUESTS) return "Too many attempts. Wait a minute.";
  if (error.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    const requestId = requestIdOf(error);
    return requestId
      ? `${fallback} The server had a problem (request ${requestId}).`
      : `${fallback} The server had a problem.`;
  }
  return `${fallback} (${error.code || `HTTP ${error.status}`})`;
}
