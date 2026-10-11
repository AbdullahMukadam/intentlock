import { base64url, SignJWT } from "jose";
import { describe, expect, test } from "vitest";

import { GITHUB_POLICY, NOW, PLAN, signedToken, testKeys } from "../../test/fixtures/bundle.js";
import { InvalidTokenError, TokenExpiredError } from "../errors.js";
import { signBundle, verifyBundle } from "./bundle-token.js";
import { generateSigningKeyPair } from "./keys.js";
import { Plan } from "../schemas/plan.js";

const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("verifyBundle", () => {
  test("accepts a valid token and returns the claims", async () => {
    const { publicKey } = await testKeys();
    const claims = await verifyBundle(await signedToken(), publicKey, NOW);
    expect(claims).toMatchObject({
      iss: "intentlock",
      sub: PLAN.user,
      jti: "plan_01",
      agent: "agent_gh",
      polv: 3,
      role: "member",
      org: "org_1",
      exp: claims.iat + 900,
    });
    expect(claims.plan.steps[0]!.maxCalls).toBe(20);
  });

  test("allows 30 s of clock leeway after exp, then reports expiry", async () => {
    const { publicKey } = await testKeys();
    const token = await signedToken({ ttlSeconds: 60 });
    await expect(verifyBundle(token, publicKey, at(89))).resolves.toBeDefined();
    await expect(verifyBundle(token, publicKey, at(91))).rejects.toBeInstanceOf(TokenExpiredError);
  });

  test("rejects a tampered payload", async () => {
    const { publicKey } = await testKeys();
    const [header, payload, sig] = (await signedToken()).split(".");
    const claims = JSON.parse(new TextDecoder().decode(base64url.decode(payload!)));
    claims.plan.steps.push({ tool: "github_create_pull_request", maxCalls: 20, required: false });
    const forged = `${header}.${base64url.encode(JSON.stringify(claims))}.${sig}`;
    const err = await verifyBundle(forged, publicKey, NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidTokenError);
    expect(err).not.toBeInstanceOf(TokenExpiredError);
  });

  test("rejects a token signed with another key", async () => {
    const other = await generateSigningKeyPair();
    await expect(verifyBundle(await signedToken(), other.publicKey, NOW)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  test("rejects other algorithms (HS256, none)", async () => {
    const { publicKey } = await testKeys();
    const hs = await new SignJWT({ plan: PLAN })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("intentlock")
      .sign(new TextEncoder().encode("x".repeat(32)));
    const none = `${base64url.encode('{"alg":"none"}')}.${base64url.encode('{"iss":"intentlock"}')}.`;
    await expect(verifyBundle(hs, publicKey, NOW)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verifyBundle(none, publicKey, NOW)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  test("rejects a correctly signed token whose claims break the schema or the hashes", async () => {
    const { privateKey, publicKey, kid } = await testKeys();
    const sign = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "EdDSA", kid })
        .setIssuer("intentlock")
        .setSubject(PLAN.user)
        .setJti("p")
        .setIssuedAt(NOW.getTime() / 1000)
        .setExpirationTime(NOW.getTime() / 1000 + 60)
        .sign(privateKey);
    const valid = {
      ph: "",
      plan: Plan.parse(PLAN),
      agent: "a",
      pol: GITHUB_POLICY,
      polv: 1,
      polh: "",
      role: "member",
      groups: [],
      org: "o",
    };
    await expect(
      verifyBundle(await sign({ ...valid, role: "root" }), publicKey, NOW),
    ).rejects.toThrow(/schema/);
    await expect(verifyBundle(await sign(valid), publicKey, NOW)).rejects.toThrow(/Plan hash/);
    const realToken = await verifyBundle(await signedToken(), publicKey, NOW);
    await expect(
      verifyBundle(await sign({ ...valid, ph: realToken.ph }), publicKey, NOW),
    ).rejects.toThrow(/Policy hash/);
    const otherUser = { ...valid, ph: realToken.ph, polh: realToken.polh };
    await expect(
      verifyBundle(
        await new SignJWT(otherUser)
          .setProtectedHeader({ alg: "EdDSA" })
          .setIssuer("intentlock")
          .setSubject("bob@acme-demo.dev")
          .setJti("p")
          .setIssuedAt(NOW.getTime() / 1000)
          .setExpirationTime(NOW.getTime() / 1000 + 60)
          .sign(privateKey),
        publicKey,
        NOW,
      ),
    ).rejects.toThrow(/subject/);
  });

  test("accepts a key resolver (JWKS)", async () => {
    const { publicKey } = await testKeys();
    await expect(
      verifyBundle(await signedToken(), async () => publicKey, NOW),
    ).resolves.toBeDefined();
  });
});

describe("signBundle", () => {
  test.each([0, -1, 3601, 1.5])("rejects ttlSeconds %s", async (ttlSeconds) => {
    const { privateKey, kid } = await testKeys();
    const input = {
      planId: "p",
      plan: Plan.parse(PLAN),
      agent: "a",
      policy: GITHUB_POLICY,
      policyVersion: 1,
      role: "member" as const,
      groups: [],
      org: "o",
    };
    await expect(
      signBundle(input, { privateKey, kid, now: NOW, ttlSeconds }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
