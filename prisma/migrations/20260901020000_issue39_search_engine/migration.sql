CREATE TYPE "SearchRunStatus" AS ENUM ('RUNNING', 'STOPPING', 'COMPLETED', 'FAILED');

ALTER TABLE "search_runs"
  ADD COLUMN "status" "SearchRunStatus" NOT NULL DEFAULT 'RUNNING',
  ADD COLUMN "algorithm" TEXT NOT NULL DEFAULT 'random',
  ADD COLUMN "searchConfig" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "stopReason" TEXT,
  ADD COLUMN "acceptedCandidates" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bestScore" DECIMAL(38,18),
  ADD COLUMN "consecutiveNoImprovement" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inFlightJobs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "startedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "stoppedAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "experiments"
  ADD COLUMN "searchRunId" UUID,
  ADD COLUMN "fingerprint" TEXT;

ALTER TABLE "backtest_jobs"
  ADD COLUMN "searchRunId" UUID;

CREATE INDEX "search_runs_ownerId_status_idx" ON "search_runs"("ownerId", "status");
CREATE INDEX "experiments_searchRunId_idx" ON "experiments"("searchRunId");
CREATE INDEX "backtest_jobs_searchRunId_idx" ON "backtest_jobs"("searchRunId");

ALTER TABLE "experiments"
  ADD CONSTRAINT "experiments_searchRunId_fkey"
  FOREIGN KEY ("searchRunId") REFERENCES "search_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "backtest_jobs"
  ADD CONSTRAINT "backtest_jobs_searchRunId_fkey"
  FOREIGN KEY ("searchRunId") REFERENCES "search_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
