import {
  decide,
  DEFAULT_TTL_SECONDS,
  keyId,
  Plan,
  planHash,
  policyHash,
  PolicySet,
  publicKeyFromPrivate,
  signBundle,
  type GateDecision,
  type PlanInput,
  type Role,
  type ToolCall,
} from "@intentlock/core";

import type { Gate, HoldOutcome, SignedPlan } from "./gate.js";

export interface LocalUser {
  role: Role;
  groups?: string[];
}

export interface LocalGateOptions {
  privateKey: CryptoKey;
  policies: PolicySet;
  /** Known users by email. When given, plans for anyone else are refused. */
  users?: Record<string, LocalUser>;
  now?: () => Date;
  ttlSeconds?: number;
}

/** In-process gate for tests, evals and offline dev. No server, so holds are blocked. */
export class LocalGate implements Gate {
  readonly #opts: LocalGateOptions;
  readonly #policy: PolicySet;
  readonly #usage = new Map<string, number[]>();
  #keys?: Promise<{ publicKey: CryptoKey; kid: string }>;

  constructor(opts: LocalGateOptions) {
    this.#opts = opts;
    this.#policy = PolicySet.parse(opts.policies);
  }

  #now(): Date {
    return this.#opts.now?.() ?? new Date();
  }

  #publicKeys() {
    this.#keys ??= publicKeyFromPrivate(this.#opts.privateKey).then(async (publicKey) => ({
      publicKey,
      kid: await keyId(publicKey),
    }));
    return this.#keys;
  }

  #user(email: string): LocalUser {
    if (!this.#opts.users) return { role: "member" };
    const match = Object.entries(this.#opts.users).find(
      ([e]) => e.toLowerCase() === email.toLowerCase(),
    );
    if (!match) throw new Error(`Unknown user ${email}`);
    return match[1];
  }

  async signPlan(input: PlanInput): Promise<SignedPlan> {
    const plan = Plan.parse(input);
    const user = this.#user(plan.user);
    const planId = crypto.randomUUID();
    const now = this.#now();
    const ttlSeconds = this.#opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const token = await signBundle(
      {
        planId,
        plan,
        agent: "local",
        policy: this.#policy,
        policyVersion: 1,
        role: user.role,
        groups: user.groups ?? [],
        org: "local",
      },
      { privateKey: this.#opts.privateKey, kid: (await this.#publicKeys()).kid, now, ttlSeconds },
    );
    return {
      planId,
      token,
      planHash: await planHash(plan),
      policyVersion: 1,
      policyHash: await policyHash(this.#policy),
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    };
  }

  async check(token: string, call: ToolCall): Promise<GateDecision> {
    const usageFor = (planId: string) => {
      let usage = this.#usage.get(planId);
      if (!usage) this.#usage.set(planId, (usage = []));
      return usage;
    };
    const decision = await decide(
      token,
      (await this.#publicKeys()).publicKey,
      call,
      usageFor,
      this.#now(),
    );
    if (decision.verdict === "hold")
      return { verdict: "block", ruleId: decision.ruleId, reason: "hold_requires_server" };
    return decision;
  }

  async waitForHold(): Promise<HoldOutcome> {
    return "rejected";
  }

  async report(): Promise<void> {}

  async close(): Promise<void> {}
}
