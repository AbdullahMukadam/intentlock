ALTER TABLE "Organization" ADD COLUMN "licenseClockAt" TIMESTAMP(3);

CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jws" TEXT NOT NULL,
    "appliedBy" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "License_orgId_key" ON "License"("orgId");
