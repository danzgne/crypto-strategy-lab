-- Strategy versions are reusable by deterministic owner-scoped identity. Legacy
-- rows remain nullable and are still traceable by their UUID and stored params.
ALTER TABLE "strategy_definitions"
ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "strategy_versions"
ADD COLUMN "canonicalIdentity" TEXT;

CREATE UNIQUE INDEX "strategy_versions_ownerId_canonicalIdentity_key"
ON "strategy_versions"("ownerId", "canonicalIdentity");

CREATE TABLE "dataset_snapshots" (
    "id" UUID NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "startTime" BIGINT NOT NULL,
    "endTime" BIGINT NOT NULL,
    "warmupCandleCount" INTEGER NOT NULL,
    "candles" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dataset_snapshots_fingerprint_key"
ON "dataset_snapshots"("fingerprint");

CREATE INDEX "dataset_snapshots_pair_timeframe_startTime_endTime_idx"
ON "dataset_snapshots"("pair", "timeframe", "startTime", "endTime");

ALTER TABLE "experiments"
ADD COLUMN "datasetSnapshotId" UUID,
ADD COLUMN "timeframe" TEXT NOT NULL DEFAULT '1m',
ADD COLUMN "simulationRulesVersion" TEXT NOT NULL DEFAULT 'historical-v1',
ADD COLUMN "evaluatorVersion" TEXT NOT NULL DEFAULT 'default-v1',
ADD COLUMN "maxDrawdownAmount" DECIMAL(38,18),
ADD COLUMN "totalTrades" INTEGER,
ADD COLUMN "wins" INTEGER,
ADD COLUMN "losses" INTEGER,
ADD COLUMN "totalProfit" DECIMAL(38,18),
ADD COLUMN "profitFactor" DECIMAL(38,18),
ADD COLUMN "profitFactorInfinite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sharpeRatio" DECIMAL(38,18);

CREATE INDEX "experiments_ownerId_createdAt_idx"
ON "experiments"("ownerId", "createdAt");

ALTER TABLE "trades"
ADD COLUMN "exitReason" TEXT;

ALTER TABLE "backtest_jobs"
ADD COLUMN "workerId" TEXT,
ADD COLUMN "leaseToken" UUID,
ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ(3);

CREATE TABLE "event_outbox" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_outbox_eventId_key" ON "event_outbox"("eventId");
CREATE INDEX "event_outbox_publishedAt_createdAt_idx"
ON "event_outbox"("publishedAt", "createdAt");

ALTER TABLE "experiments"
ADD CONSTRAINT "experiments_datasetSnapshotId_fkey"
FOREIGN KEY ("datasetSnapshotId") REFERENCES "dataset_snapshots"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
