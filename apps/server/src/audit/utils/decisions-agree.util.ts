import { type ClientEntry, type Decision, Verdict } from "@intentlock/core";

const STRICTNESS: Record<Verdict, number> = {
  [Verdict.ALLOW]: 0,
  [Verdict.HOLD]: 1,
  [Verdict.BLOCK]: 2,
};

export function decisionsAgree(
  client: NonNullable<ClientEntry["decision"]>,
  server: Decision,
): boolean {
  const c = STRICTNESS[client.verdict];
  const s = STRICTNESS[server.verdict];
  if (c !== s) return c > s;
  return client.verdict === Verdict.BLOCK || client.ruleId === server.ruleId;
}
