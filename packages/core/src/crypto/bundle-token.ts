import { errors, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

import { planHash, policyHash } from "../canonical.js";
import { InvalidTokenError, TokenExpiredError } from "../errors.js";
import { BundleClaims } from "../schemas/bundle.js";
import type { Plan } from "../schemas/plan.js";
import type { PolicySet, Role } from "../schemas/policy.js";
import { SIGNING_ALG } from "./keys.js";

export const DEFAULT_TTL_SECONDS = 15 * 60;
export const MAX_TTL_SECONDS = 60 * 60;
export const CLOCK_LEEWAY_SECONDS = 30;

export interface BundleInput {
  planId: string;
  plan: Plan;
  agent: string;
  policy: PolicySet;
  policyVersion: number;
  role: Role;
  groups: string[];
  org: string;
}

export interface SignOptions {
  privateKey: CryptoKey;
  kid: string;
  now: Date;
  ttlSeconds?: number;
}

export async function signBundle(input: BundleInput, opts: SignOptions): Promise<string> {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_TTL_SECONDS) {
    throw new RangeError(`ttlSeconds must be an integer in 1..${MAX_TTL_SECONDS}`);
  }
  const iat = Math.floor(opts.now.getTime() / 1000);
  return new SignJWT({
    ph: await planHash(input.plan),
    plan: input.plan,
    agent: input.agent,
    pol: input.policy,
    polv: input.policyVersion,
    polh: await policyHash(input.policy),
    role: input.role,
    groups: input.groups,
    org: input.org,
  })
    .setProtectedHeader({ alg: SIGNING_ALG, kid: opts.kid, typ: "JWT" })
    .setIssuer("intentlock")
    .setSubject(input.plan.user)
    .setJti(input.planId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttl)
    .sign(opts.privateKey);
}

export type VerificationKey = CryptoKey | JWTVerifyGetKey;

export async function verifyBundle(
  token: string,
  key: VerificationKey,
  now: Date,
): Promise<BundleClaims> {
  let payload: unknown;
  try {
    const opts = {
      algorithms: [SIGNING_ALG],
      issuer: "intentlock",
      currentDate: now,
      clockTolerance: CLOCK_LEEWAY_SECONDS,
      requiredClaims: ["exp", "iat", "jti", "sub"],
    };
    // jose accepts a key or a resolver at runtime; TS cannot pick an overload for the union.
    payload = (await jwtVerify(token, key as CryptoKey, opts)).payload;
  } catch (err) {
    if (err instanceof errors.JWTExpired)
      throw new TokenExpiredError("Token expired", { cause: err });
    throw new InvalidTokenError("Token signature or claims invalid", { cause: err });
  }

  const parsed = BundleClaims.safeParse(payload);
  if (!parsed.success) throw new InvalidTokenError("Token claims do not match the bundle schema");
  const claims = parsed.data;
  if (claims.sub !== claims.plan.user)
    throw new InvalidTokenError("Token subject differs from plan user");
  if (claims.ph !== (await planHash(claims.plan)))
    throw new InvalidTokenError("Plan hash mismatch");
  if (claims.polh !== (await policyHash(claims.pol)))
    throw new InvalidTokenError("Policy hash mismatch");
  return claims;
}
