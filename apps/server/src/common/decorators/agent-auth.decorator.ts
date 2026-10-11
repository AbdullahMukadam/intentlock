import { SetMetadata } from "@nestjs/common";

import { AUTH_KIND_KEY } from "../constants/auth.constants.js";
import type { AuthKind } from "../types/auth.types.js";

/** API-key routes (agent apps). Sessions are not accepted there. */
export const AgentAuth = () => SetMetadata(AUTH_KIND_KEY, "agent" satisfies AuthKind);
