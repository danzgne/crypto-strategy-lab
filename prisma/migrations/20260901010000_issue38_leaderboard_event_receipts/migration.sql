CREATE TABLE "leaderboard_event_receipts" (
  "id" UUID NOT NULL,
  "leaderboardId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "leaderboard_event_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leaderboard_event_receipts_eventId_key"
  ON "leaderboard_event_receipts"("eventId");
CREATE INDEX "leaderboard_event_receipts_leaderboardId_createdAt_idx"
  ON "leaderboard_event_receipts"("leaderboardId", "createdAt");

ALTER TABLE "leaderboard_event_receipts"
  ADD CONSTRAINT "leaderboard_event_receipts_leaderboardId_fkey"
  FOREIGN KEY ("leaderboardId") REFERENCES "leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
