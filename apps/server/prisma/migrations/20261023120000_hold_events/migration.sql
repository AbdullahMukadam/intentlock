-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "webhookSecret" TEXT,
ADD COLUMN     "webhookUrl" TEXT;

-- CreateTable
CREATE TABLE "HoldEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "HoldStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoldEvent_nextAttemptAt_idx" ON "HoldEvent"("nextAttemptAt") WHERE (("deliveredAt" IS NULL) AND ("failedAt" IS NULL));

-- CreateIndex
CREATE INDEX "HoldEvent_holdId_idx" ON "HoldEvent"("holdId");
