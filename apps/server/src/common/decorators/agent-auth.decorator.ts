import { SetMetadata } from "@nestjs/common";

import { AUTH_KIND_KEY } from "../constants/auth.constants.js";
import { AuthKind } from "../enums/auth-kind.enum.js";

export const AgentAuth = () => SetMetadata(AUTH_KIND_KEY, AuthKind.AGENT);
