CREATE TABLE "AuditPurgeRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPurgeRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditPurgeRun_orgId_day_key" ON "AuditPurgeRun"("orgId", "day");
