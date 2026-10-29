CREATE TABLE "LicenseNotice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LicenseNotice_orgId_expiresAt_kind_key" ON "LicenseNotice"("orgId", "expiresAt", "kind");
