-- CreateIndex
CREATE INDEX "service_heartbeats_lastSeenAt_idx" ON "service_heartbeats"("lastSeenAt");

-- CreateIndex
CREATE INDEX "backtest_jobs_updatedAt_idx" ON "backtest_jobs"("updatedAt");

-- CreateIndex
CREATE INDEX "event_outbox_deadLetteredAt_idx" ON "event_outbox"("deadLetteredAt");
