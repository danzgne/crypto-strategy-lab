-- CreateEnum
CREATE TYPE "JobFailureCategory" AS ENUM ('TRANSIENT', 'PERMANENT');

-- AlterTable
ALTER TABLE "backtest_jobs" ADD COLUMN "failureCategory" "JobFailureCategory",
ADD COLUMN "nextEligibleAt" TIMESTAMPTZ(3),
ADD COLUMN "failedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "backtest_jobs_status_nextEligibleAt_idx" ON "backtest_jobs"("status", "nextEligibleAt");
