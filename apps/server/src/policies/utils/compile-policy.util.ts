import { BadRequestException, HttpStatus } from "@nestjs/common";
import { parsePolicy, policyHash, type PolicySet } from "@intentlock/core";

import { PolicyError } from "../enums/policy-error.enum.js";

export async function compilePolicy(source: string): Promise<{ policy: PolicySet; hash: string }> {
  const parsed = parsePolicy(source);
  if (!parsed.ok) {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      error: PolicyError.INVALID_POLICY,
      errors: parsed.errors,
    });
  }
  return { policy: parsed.policy, hash: await policyHash(parsed.policy) };
}
