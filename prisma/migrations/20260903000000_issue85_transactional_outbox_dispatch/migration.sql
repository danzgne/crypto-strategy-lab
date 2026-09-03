ALTER TABLE "event_outbox"
  ADD COLUMN "claimToken" UUID,
  ADD COLUMN "claimExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3),
  ADD COLUMN "deadLetteredAt" TIMESTAMPTZ(3);

CREATE INDEX "event_outbox_dispatch_idx"
  ON "event_outbox"("publishedAt", "deadLetteredAt", "nextAttemptAt", "createdAt");
