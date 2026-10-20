-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- DropIndex
DROP INDEX "Agent_orgId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Agent_orgId_name_key" ON "Agent"("orgId", "name") WHERE ("deletedAt" IS NULL);
