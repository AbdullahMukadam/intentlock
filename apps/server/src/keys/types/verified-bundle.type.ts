import type { BlockReason, BundleClaims } from "@intentlock/core";

export type VerifiedBundle =
  { ok: true; bundle: BundleClaims } | { ok: false; reason: BlockReason };
