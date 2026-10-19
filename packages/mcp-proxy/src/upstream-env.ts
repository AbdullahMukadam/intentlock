import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

const INTENTLOCK_PREFIX = "INTENTLOCK_";

export function upstreamEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = { ...getDefaultEnvironment() };
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && !name.startsWith(INTENTLOCK_PREFIX)) out[name] = value;
  }
  return out;
}
