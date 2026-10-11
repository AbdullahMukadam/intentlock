import { SetMetadata } from "@nestjs/common";

import { AUTH_KIND_KEY } from "../constants/auth.constants.js";
import type { AuthKind } from "../types/auth.types.js";

/** Opens a route to anyone. Only sign-in, health and JWKS (ARCHITECTURE §5.6); routes.e2e.test.ts pins the list. */
export const Public = () => SetMetadata(AUTH_KIND_KEY, "public" satisfies AuthKind);
