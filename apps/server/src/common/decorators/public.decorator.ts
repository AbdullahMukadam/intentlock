import { SetMetadata } from "@nestjs/common";

import { AUTH_KIND_KEY } from "../constants/auth.constants.js";
import { AuthKind } from "../enums/auth-kind.enum.js";

// Only sign-in, health and JWKS may be public; routes.e2e.test.ts pins the list.
export const Public = () => SetMetadata(AUTH_KIND_KEY, AuthKind.PUBLIC);
