import { z } from "zod";

import { zodDto } from "../../../common/utils/zod-dto.util.js";
import { IdentityProvider } from "../../../generated/prisma/client.js";

export class OAuthProviderParamsDto extends zodDto(
  z.object({ provider: z.enum(IdentityProvider) }),
) {}
