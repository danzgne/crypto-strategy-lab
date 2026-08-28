-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "backtest_jobs" ADD COLUMN     "claimedAt" TIMESTAMPTZ(3),
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "experimentId" UUID NOT NULL,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- AlterTable
ALTER TABLE "experiments" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endTime" BIGINT NOT NULL,
ADD COLUMN     "initialInvestment" DECIMAL(38,18) NOT NULL,
ADD COLUMN     "maxDrawdown" DECIMAL(38,18),
ADD COLUMN     "pair" TEXT NOT NULL,
ADD COLUMN     "return" DECIMAL(38,18),
ADD COLUMN     "score" DECIMAL(38,18),
ADD COLUMN     "slippage" DECIMAL(38,18) NOT NULL,
ADD COLUMN     "startTime" BIGINT NOT NULL,
ADD COLUMN     "strategyVersionId" UUID NOT NULL,
ADD COLUMN     "transactionCost" DECIMAL(38,18) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "winRate" DECIMAL(38,18);

-- AlterTable
ALTER TABLE "strategy_definitions" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- AlterTable
ALTER TABLE "strategy_versions" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "params" JSONB NOT NULL,
ADD COLUMN     "strategyDefinitionId" UUID NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- AlterTable
ALTER TABLE "trades" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "direction" TEXT NOT NULL,
ADD COLUMN     "entryPrice" DECIMAL(38,18) NOT NULL,
ADD COLUMN     "entryTime" BIGINT NOT NULL,
ADD COLUMN     "exitPrice" DECIMAL(38,18),
ADD COLUMN     "exitTime" BIGINT,
ADD COLUMN     "experimentId" UUID NOT NULL,
ADD COLUMN     "investment" DECIMAL(38,18) NOT NULL,
ADD COLUMN     "pair" TEXT NOT NULL,
ADD COLUMN     "profit" DECIMAL(38,18),
ADD COLUMN     "slippage" DECIMAL(38,18) NOT NULL,
ADD COLUMN     "stopLoss" DECIMAL(38,18),
ADD COLUMN     "takeProfit" DECIMAL(38,18),
ADD COLUMN     "transactionCost" DECIMAL(38,18) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "backtest_jobs_experimentId_key" ON "backtest_jobs"("experimentId");

-- CreateIndex
CREATE INDEX "backtest_jobs_status_claimedAt_idx" ON "backtest_jobs"("status", "claimedAt");

-- CreateIndex
CREATE INDEX "trades_experimentId_idx" ON "trades"("experimentId");

-- AddForeignKey
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategyDefinitionId_fkey" FOREIGN KEY ("strategyDefinitionId") REFERENCES "strategy_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "strategy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_jobs" ADD CONSTRAINT "backtest_jobs_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

