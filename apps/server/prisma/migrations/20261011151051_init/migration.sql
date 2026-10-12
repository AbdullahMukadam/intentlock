-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'approver', 'member');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "loginTokenHash" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicySet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "activeVersion" INTEGER NOT NULL,

    CONSTRAINT "PolicySet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "policySetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "compiled" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rolledBackFrom" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDraft" (
    "policySetId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDraft_pkey" PRIMARY KEY ("policySetId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "planHash" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepUsage" (
    "orgId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "ran" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StepUsage_pkey" PRIMARY KEY ("planId","step")
);

-- CreateTable
CREATE TABLE "Hold" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "user" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "approvers" JSONB NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedBy" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "agentId" TEXT NOT NULL,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "seq" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'server',
    "actor" TEXT,
    "user" TEXT,
    "planId" TEXT,
    "agentId" TEXT,
    "tool" TEXT,
    "verdict" TEXT,
    "ruleId" TEXT,
    "policyVersion" INTEGER,
    "clientSeq" INTEGER,
    "clientAt" TIMESTAMP(3),
    "clientHash" TEXT,
    "flagged" TEXT,
    "payload" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_orgId_name_key" ON "Agent"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");

-- CreateIndex
CREATE INDEX "ApiKey_agentId_idx" ON "ApiKey"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PolicySet_agentId_key" ON "PolicySet"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_policySetId_version_key" ON "PolicyVersion"("policySetId", "version");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Plan_orgId_agentId_createdAt_idx" ON "Plan"("orgId", "agentId", "createdAt");

-- CreateIndex
CREATE INDEX "Plan_orgId_user_createdAt_idx" ON "Plan"("orgId", "user", "createdAt");

-- CreateIndex
CREATE INDEX "Hold_orgId_status_expiresAt_idx" ON "Hold"("orgId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Hold_planId_idx" ON "Hold"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEntry_hash_key" ON "AuditEntry"("hash");

-- CreateIndex
CREATE INDEX "AuditEntry_orgId_at_idx" ON "AuditEntry"("orgId", "at");

-- CreateIndex
CREATE INDEX "AuditEntry_orgId_agentId_at_idx" ON "AuditEntry"("orgId", "agentId", "at");

-- CreateIndex
CREATE INDEX "AuditEntry_orgId_verdict_at_idx" ON "AuditEntry"("orgId", "verdict", "at");

-- CreateIndex
CREATE INDEX "AuditEntry_orgId_user_at_idx" ON "AuditEntry"("orgId", "user", "at");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEntry_planId_clientSeq_key" ON "AuditEntry"("planId", "clientSeq");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySet" ADD CONSTRAINT "PolicySet_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_policySetId_fkey" FOREIGN KEY ("policySetId") REFERENCES "PolicySet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDraft" ADD CONSTRAINT "PolicyDraft_policySetId_fkey" FOREIGN KEY ("policySetId") REFERENCES "PolicySet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepUsage" ADD CONSTRAINT "StepUsage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
