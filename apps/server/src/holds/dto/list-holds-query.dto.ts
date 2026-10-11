import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { HoldState } from "../enums/hold-state.enum.js";

export class ListHoldsQueryDto extends zodDto(
  z.strictObject({ status: z.enum(HoldState).optional() }),
) {}
