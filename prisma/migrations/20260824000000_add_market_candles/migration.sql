CREATE TABLE "candles" (
    "id" UUID NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "openTime" BIGINT NOT NULL,
    "closeTime" BIGINT NOT NULL,
    "open" NUMERIC(38,18) NOT NULL,
    "high" NUMERIC(38,18) NOT NULL,
    "low" NUMERIC(38,18) NOT NULL,
    "close" NUMERIC(38,18) NOT NULL,
    "volume" NUMERIC(38,18) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "candles_pair_timeframe_openTime_key"
    ON "candles"("pair", "timeframe", "openTime");

CREATE INDEX "candles_pair_timeframe_closeTime_idx"
    ON "candles"("pair", "timeframe", "closeTime");
