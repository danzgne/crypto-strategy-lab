ALTER TABLE "leaderboard"
  ADD COLUMN "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

DELETE FROM "leaderboard" duplicate
USING "leaderboard" keeper
WHERE duplicate."ownerId" = keeper."ownerId"
  AND duplicate.id > keeper.id;

CREATE UNIQUE INDEX "leaderboard_ownerId_key" ON "leaderboard"("ownerId");

CREATE TABLE "leaderboard_entries" (
  "id" UUID NOT NULL,
  "leaderboardId" UUID NOT NULL,
  "experimentId" UUID NOT NULL,
  "rank" INTEGER NOT NULL,
  "strategyVersionId" UUID NOT NULL,
  "strategyDisplayName" TEXT NOT NULL,
  "memberStrategies" JSONB NOT NULL,
  "pair" TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "startTime" BIGINT NOT NULL,
  "endTime" BIGINT NOT NULL,
  "score" DECIMAL(38,18) NOT NULL,
  "return" DECIMAL(38,18) NOT NULL,
  "winRate" DECIMAL(38,18) NOT NULL,
  "maxDrawdown" DECIMAL(38,18) NOT NULL,
  "totalProfit" DECIMAL(38,18) NOT NULL,
  "totalTrades" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leaderboard_entries_leaderboardId_experimentId_key"
  ON "leaderboard_entries"("leaderboardId", "experimentId");
CREATE INDEX "leaderboard_entries_leaderboardId_rank_idx"
  ON "leaderboard_entries"("leaderboardId", "rank");

ALTER TABLE "leaderboard_entries"
  ADD CONSTRAINT "leaderboard_entries_leaderboardId_fkey"
  FOREIGN KEY ("leaderboardId") REFERENCES "leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "leaderboard_entries_experimentId_fkey"
  FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
