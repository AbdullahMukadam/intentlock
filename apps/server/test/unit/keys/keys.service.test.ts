import {
  BlockReason,
  exportPrivateKeyPem,
  exportPublicKeyPem,
  generateSigningKeyPair,
  parsePolicy,
  Plan,
  STARTER_POLICY,
} from "@intentlock/core";

import { loadEnv } from "../../../src/config/env.schema.js";
import { KeysService } from "../../../src/keys/keys.service.js";

const CALLER = { orgId: "org_1", agentId: "agent_1", apiKeyId: "key_1" };
const NOW = new Date("2026-10-19T10:00:00Z");

async function keysWith(vars: Record<string, string>) {
  const keys = new KeysService(loadEnv({ DATABASE_URL: "postgresql://x@localhost/db", ...vars }));
  await keys.onModuleInit();
  return keys;
}

async function newPem() {
  return exportPrivateKeyPem((await generateSigningKeyPair()).privateKey);
}

async function signWith(keys: KeysService) {
  const parsed = parsePolicy(STARTER_POLICY);
  if (!parsed.ok) throw new Error("starter policy does not parse");
  const { token } = await keys.sign(
    {
      planId: "plan_1",
      plan: Plan.parse({
        version: 1,
        goal: "List issues",
        user: "sam@acme.dev",
        steps: [{ tool: "github_list_issues" }],
      }),
      agent: CALLER.agentId,
      policy: parsed.policy,
      policyVersion: 1,
      role: "member",
      groups: [],
      org: CALLER.orgId,
    },
    NOW,
  );
  return token;
}

describe("KeysService signing key rotation", () => {
  it("accepts tokens signed with the previous key during the overlap and refuses them after", async () => {
    const oldPem = await newPem();
    const nextPem = await newPem();
    const oldToken = await signWith(await keysWith({ SIGNING_KEY: oldPem }));

    const during = await keysWith({ SIGNING_KEY: nextPem, SIGNING_KEY_PREVIOUS: oldPem });
    expect((await during.jwks()).keys).toHaveLength(2);
    expect((await during.verifyForAgent(oldToken, CALLER, NOW)).ok).toBe(true);
    const nextToken = await signWith(during);

    const after = await keysWith({ SIGNING_KEY: nextPem });
    expect((await after.jwks()).keys).toHaveLength(1);
    expect((await after.verifyForAgent(nextToken, CALLER, NOW)).ok).toBe(true);
    expect(await after.verifyForAgent(oldToken, CALLER, NOW)).toEqual({
      ok: false,
      reason: BlockReason.INVALID_TOKEN,
    });
  });

  it("accepts only the public half of the previous key", async () => {
    const old = await generateSigningKeyPair();
    const oldToken = await signWith(
      await keysWith({ SIGNING_KEY: await exportPrivateKeyPem(old.privateKey) }),
    );
    const during = await keysWith({
      SIGNING_KEY: await newPem(),
      SIGNING_KEY_PREVIOUS: await exportPublicKeyPem(old.publicKey),
    });
    expect((await during.verifyForAgent(oldToken, CALLER, NOW)).ok).toBe(true);
  });

  it("refuses tokens from an unknown key", async () => {
    const stranger = await signWith(await keysWith({ SIGNING_KEY: await newPem() }));
    const keys = await keysWith({ SIGNING_KEY: await newPem() });
    expect(await keys.verifyForAgent(stranger, CALLER, NOW)).toEqual({
      ok: false,
      reason: BlockReason.INVALID_TOKEN,
    });
  });

  it("refuses to start in production without a signing key", async () => {
    await expect(keysWith({ NODE_ENV: "production" })).rejects.toThrow(/SIGNING_KEY is required/);
  });
});
