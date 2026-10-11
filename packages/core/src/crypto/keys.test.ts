import { describe, expect, test } from "vitest";

import { signBundle, verifyBundle } from "./bundle-token.js";
import {
  exportPrivateKeyPem,
  exportPublicKeyPem,
  generateSigningKeyPair,
  importPrivateKeyPem,
  importPublicKeyPem,
  keyId,
  publicJwk,
  publicKeyFromPrivate,
} from "./keys.js";
import { GITHUB_POLICY, NOW, PLAN } from "../../test/fixtures/bundle.js";
import { Plan } from "../schemas/plan.js";

describe("keys", () => {
  test("PEM export/import round-trips and the imported keys sign and verify", async () => {
    const pair = await generateSigningKeyPair();
    const privatePem = await exportPrivateKeyPem(pair.privateKey);
    const publicPem = await exportPublicKeyPem(pair.publicKey);
    expect(privatePem).toContain("BEGIN PRIVATE KEY");
    expect(publicPem).toContain("BEGIN PUBLIC KEY");

    const privateKey = await importPrivateKeyPem(privatePem);
    const publicKey = await importPublicKeyPem(publicPem);
    const kid = await keyId(publicKey);
    const token = await signBundle(
      {
        planId: "p",
        plan: Plan.parse(PLAN),
        agent: "a",
        policy: GITHUB_POLICY,
        policyVersion: 1,
        role: "member",
        groups: [],
        org: "o",
      },
      { privateKey, kid, now: NOW },
    );
    await expect(verifyBundle(token, publicKey, NOW)).resolves.toMatchObject({ jti: "p" });
  });

  test("kid is 8 chars, stable per key and differs between keys", async () => {
    const a = await generateSigningKeyPair();
    const b = await generateSigningKeyPair();
    const kidA = await keyId(a.publicKey);
    expect(kidA).toHaveLength(8);
    expect(await keyId(await importPublicKeyPem(await exportPublicKeyPem(a.publicKey)))).toBe(kidA);
    expect(await keyId(b.publicKey)).not.toBe(kidA);
  });

  test("publicKeyFromPrivate derives the matching public key", async () => {
    const pair = await generateSigningKeyPair();
    expect(await keyId(await publicKeyFromPrivate(pair.privateKey))).toBe(
      await keyId(pair.publicKey),
    );
  });

  test("publicJwk has kid, alg and no private part", async () => {
    const { publicKey } = await generateSigningKeyPair();
    const jwk = await publicJwk(publicKey);
    expect(jwk).toMatchObject({
      kty: "OKP",
      crv: "Ed25519",
      alg: "EdDSA",
      use: "sig",
      kid: await keyId(publicKey),
    });
    expect(jwk).not.toHaveProperty("d");
  });
});
