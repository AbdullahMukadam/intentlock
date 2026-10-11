import { parsePolicy, policyHash, STARTER_POLICY } from "@intentlock/core";

import type { OrgTx } from "../../org/utils/org-db.util.js";

export async function createAgent(
  db: Pick<OrgTx, "agent">,
  orgId: string,
  input: { name: string; description?: string | null | undefined; createdBy: string },
) {
  const parsed = parsePolicy(STARTER_POLICY);
  if (!parsed.ok) throw new Error("starter policy does not parse");
  const hash = await policyHash(parsed.policy);
  return db.agent.create({
    data: {
      orgId,
      name: input.name,
      description: input.description ?? null,
      createdBy: input.createdBy,
      policy: {
        create: {
          orgId,
          activeVersion: 1,
          versions: {
            create: {
              orgId,
              version: 1,
              source: STARTER_POLICY,
              compiled: parsed.policy,
              hash,
              message: "Starter policy",
              authorId: input.createdBy,
            },
          },
        },
      },
    },
  });
}
