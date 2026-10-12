import { ApiClient } from "./api-client.js";
import { loadSession } from "../session/session-store.js";
import type { CliContext } from "../types/cli-context.type.js";

export async function sessionApi(ctx: CliContext): Promise<ApiClient> {
  return new ApiClient(ctx, await loadSession(ctx.home));
}
