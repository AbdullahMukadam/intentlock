import { HoldStatus } from "../../generated/prisma/client.js";
import { HoldState } from "../enums/hold-state.enum.js";

export function toHoldState(status: HoldStatus): HoldState {
  return HoldState[status];
}

export function toHoldStatus(state: HoldState): HoldStatus {
  return HoldStatus[state.toUpperCase() as keyof typeof HoldStatus];
}
