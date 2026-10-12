import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MAX_TTL_SECONDS, Plan, planHash, policyHash, PolicySet } from "@intentlock/core";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import type { AgentCaller } from "../common/types/auth.types.js";
import { toJson } from "../common/utils/to-json.util.js";
import { ulid } from "../common/utils/ulid.util.js";
import { PlanStatus } from "../generated/prisma/client.js";
import { KeysService } from "../keys/keys.service.js";
import { orgDb, type OrgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PlanError } from "./enums/plan-error.enum.js";
import { unsafeRegexes } from "./utils/unsafe-regexes.util.js";

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
  ) {}

  async sign(caller: AgentCaller, plan: Plan) {
    const unsafe = unsafeRegexes(plan);
    if (unsafe.length > 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: PlanError.UNSAFE_REGEX,
        patterns: unsafe,
      });
    }
    const db = orgDb(this.prisma, caller.orgId);
    await this.enabledAgent(db, caller.agentId);
    const user = await this.activeUser(db, plan.user);
    const snapshot = await this.activePolicy(db, caller.agentId);
    const planId = ulid();
    const now = new Date();
    const { token, expiresAt } = await this.keys.sign(
      {
        planId,
        plan,
        agent: caller.agentId,
        policy: snapshot.policy,
        policyVersion: snapshot.version,
        role: user.role,
        groups: user.groups,
        org: caller.orgId,
      },
      now,
    );
    const hash = await planHash(plan);
    const polHash = await policyHash(snapshot.policy);
    await db.$transaction(async (tx) => {
      await tx.plan.create({
        data: {
          id: planId,
          orgId: caller.orgId,
          agentId: caller.agentId,
          policyVersion: snapshot.version,
          planHash: hash,
          user: plan.user,
          goal: plan.goal,
          body: toJson(plan),
          expiresAt,
        },
      });
      await tx.stepUsage.createMany({
        data: plan.steps.map((_, step) => ({ orgId: caller.orgId, planId, step })),
      });
      await this.audit.append(
        caller.orgId,
        [
          {
            kind: AuditKind.PLAN_SIGNED,
            actor: caller.agentId,
            agentId: caller.agentId,
            user: plan.user,
            planId,
            policyVersion: snapshot.version,
            payload: {
              planHash: hash,
              policyHash: polHash,
              goal: plan.goal,
              steps: plan.steps.length,
              apiKeyId: caller.apiKeyId,
            },
          },
        ],
        tx,
      );
    });
    return {
      planId,
      token,
      planHash: hash,
      policyVersion: snapshot.version,
      policyHash: polHash,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // Re-signs the stored plan (never the token's copy) with the current policy and user role.
  async refresh(caller: AgentCaller, planId: string, token: string) {
    const now = new Date();
    const verified = await this.keys.verifyForAgent(token, caller, now, MAX_TTL_SECONDS);
    if (!verified.ok || verified.bundle.jti !== planId) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: verified.ok ? PlanError.PLAN_NOT_FOUND : verified.reason,
      });
    }
    const db = orgDb(this.prisma, caller.orgId);
    const row = await db.plan.findFirst({ where: { id: planId, agentId: caller.agentId } });
    if (!row) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: PlanError.PLAN_NOT_FOUND,
      });
    }
    if (row.status !== PlanStatus.ACTIVE) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: PlanError.PLAN_NOT_ACTIVE,
      });
    }
    if (row.planHash !== verified.bundle.ph) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: PlanError.PLAN_HASH_MISMATCH,
      });
    }
    await this.enabledAgent(db, caller.agentId);
    const plan = Plan.parse(row.body);
    const user = await this.activeUser(db, plan.user);
    const snapshot = await this.activePolicy(db, caller.agentId);
    const signed = await this.keys.sign(
      {
        planId,
        plan,
        agent: caller.agentId,
        policy: snapshot.policy,
        policyVersion: snapshot.version,
        role: user.role,
        groups: user.groups,
        org: caller.orgId,
      },
      now,
    );
    await db.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id: planId },
        data: { expiresAt: signed.expiresAt, policyVersion: snapshot.version },
      });
      await this.audit.append(
        caller.orgId,
        [
          {
            kind: AuditKind.PLAN_REFRESHED,
            actor: caller.agentId,
            agentId: caller.agentId,
            user: plan.user,
            planId,
            policyVersion: snapshot.version,
            payload: { planHash: row.planHash, apiKeyId: caller.apiKeyId },
          },
        ],
        tx,
      );
    });
    return { token: signed.token, expiresAt: signed.expiresAt.toISOString() };
  }

  private async enabledAgent(db: OrgDb, agentId: string) {
    const agent = await db.agent.findFirst({ where: { id: agentId } });
    if (!agent || agent.disabledAt) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: PlanError.AGENT_DISABLED,
      });
    }
  }

  private async activeUser(db: OrgDb, email: string) {
    const user = await db.user.findFirst({
      where: { email: email.toLowerCase(), disabledAt: null },
    });
    if (!user) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: PlanError.UNKNOWN_USER,
      });
    }
    return user;
  }

  private async activePolicy(db: OrgDb, agentId: string) {
    const set = await db.policySet.findFirstOrThrow({ where: { agentId } });
    const version = await db.policyVersion.findFirstOrThrow({
      where: { policySetId: set.id, version: set.activeVersion },
    });
    return { version: version.version, policy: PolicySet.parse(version.compiled) };
  }
}
