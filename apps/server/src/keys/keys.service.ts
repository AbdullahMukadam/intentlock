import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import {
  BlockReason,
  type BundleInput,
  DEFAULT_TTL_SECONDS,
  exportPrivateKeyPem,
  generateSigningKeyPair,
  importPrivateKeyPem,
  importPublicKeyPem,
  keyId,
  publicJwk,
  publicKeyFromPrivate,
  signBundle,
  TokenExpiredError,
  verifyBundle,
} from "@intentlock/core";
import { decodeJwt, type JWTPayload, type JWTVerifyGetKey, jwtVerify, SignJWT } from "jose";

import { LoggerContext } from "../common/enums/logger-context.enum.js";
import type { AgentCaller } from "../common/types/auth.types.js";
import { ENV, type Env } from "../config/config.module.js";
import { NodeEnv } from "../config/enums/node-env.enum.js";
import type { VerifiedBundle } from "./types/verified-bundle.type.js";
import { normalizePem } from "./utils/normalize-pem.util.js";

@Injectable()
export class KeysService implements OnModuleInit {
  private readonly log = new Logger(LoggerContext.KEYS);
  private signing: { privateKey: CryptoKey; kid: string } | undefined;
  private readonly publicKeys = new Map<string, CryptoKey>();
  private readonly resolveKey: JWTVerifyGetKey = (header) => {
    const key = header.kid ? this.publicKeys.get(header.kid) : undefined;
    if (!key) throw new Error("unknown signing key id");
    return key;
  };

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit() {
    let privateKey: CryptoKey;
    if (this.env.SIGNING_KEY) {
      privateKey = await importPrivateKeyPem(normalizePem(this.env.SIGNING_KEY));
    } else if (this.env.NODE_ENV === NodeEnv.PRODUCTION) {
      throw new Error(
        "SIGNING_KEY is required in production; generate one with `intentlock keygen`",
      );
    } else {
      privateKey = (await generateSigningKeyPair()).privateKey;
      this.log.warn(
        `SIGNING_KEY is unset; generated a dev key (set it to keep tokens valid across restarts):\n${await exportPrivateKeyPem(privateKey)}`,
      );
    }
    const publicKey = await publicKeyFromPrivate(privateKey);
    const kid = await keyId(publicKey);
    this.signing = { privateKey, kid };
    this.publicKeys.set(kid, publicKey);
    if (this.env.SIGNING_KEY_PREVIOUS) {
      const previous = await this.importAnyPem(normalizePem(this.env.SIGNING_KEY_PREVIOUS));
      this.publicKeys.set(await keyId(previous), previous);
    }
  }

  isReady(): boolean {
    return this.signing !== undefined;
  }

  async sign(input: BundleInput, now: Date) {
    if (!this.signing) throw new Error("signing key not loaded");
    const token = await signBundle(input, {
      ...this.signing,
      now,
      ttlSeconds: DEFAULT_TTL_SECONDS,
    });
    return { token, expiresAt: new Date(now.getTime() + DEFAULT_TTL_SECONDS * 1000) };
  }

  async jwks() {
    return { keys: await Promise.all([...this.publicKeys.values()].map(publicJwk)) };
  }

  // Binds the token to the calling agent; allowExpiredSeconds lets refresh and report accept a recently expired token.
  async verifyForAgent(
    token: string,
    caller: AgentCaller,
    now: Date,
    allowExpiredSeconds = 0,
  ): Promise<VerifiedBundle> {
    let at = now;
    if (allowExpiredSeconds > 0) {
      let exp: number | undefined;
      try {
        exp = decodeJwt(token).exp;
      } catch {
        return { ok: false, reason: BlockReason.INVALID_TOKEN };
      }
      if (exp !== undefined && exp * 1000 <= now.getTime()) {
        if (now.getTime() - exp * 1000 > allowExpiredSeconds * 1000) {
          return { ok: false, reason: BlockReason.TOKEN_EXPIRED };
        }
        at = new Date(exp * 1000 - 1000);
      }
    }
    try {
      const bundle = await verifyBundle(token, this.resolveKey, at);
      if (bundle.agent !== caller.agentId || bundle.org !== caller.orgId) {
        return { ok: false, reason: BlockReason.INVALID_TOKEN };
      }
      return { ok: true, bundle };
    } catch (err) {
      return {
        ok: false,
        reason:
          err instanceof TokenExpiredError ? BlockReason.TOKEN_EXPIRED : BlockReason.INVALID_TOKEN,
      };
    }
  }

  async signState(
    payload: Record<string, unknown>,
    typ: string,
    issuer: string,
    ttlSeconds: number,
  ) {
    if (!this.signing) throw new Error("signing key not loaded");
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "EdDSA", kid: this.signing.kid, typ })
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.signing.privateKey);
  }

  async verifyState(jws: string, typ: string, issuer: string): Promise<JWTPayload | null> {
    try {
      const { payload } = await jwtVerify(jws, this.resolveKey, {
        algorithms: ["EdDSA"],
        issuer,
        typ,
      });
      return payload;
    } catch {
      return null;
    }
  }

  private async importAnyPem(pem: string): Promise<CryptoKey> {
    try {
      return await publicKeyFromPrivate(await importPrivateKeyPem(pem));
    } catch {
      return importPublicKeyPem(pem);
    }
  }
}
