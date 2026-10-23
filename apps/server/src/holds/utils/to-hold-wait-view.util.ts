import type { Hold } from "../../generated/prisma/client.js";
import type { HoldState } from "../enums/hold-state.enum.js";
import { toHoldState } from "./hold-state.util.js";

export type HoldWaitView = {
  status: HoldState;
  planId: string;
  callId: string;
  tool: string;
  args: unknown;
};

export function toHoldWaitView(hold: Hold): HoldWaitView {
  return {
    status: toHoldState(hold.status),
    planId: hold.planId,
    callId: hold.callId,
    tool: hold.tool,
    args: hold.args,
  };
}
