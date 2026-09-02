CREATE TYPE "SentimentLabel" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

CREATE TYPE "NewsEventType" AS ENUM (
  'ETF_FUND_FLOW',
  'PROTOCOL_UPGRADE',
  'REGULATION',
  'PARTNERSHIP',
  'MARKET_TREND',
  'OTHER'
);

ALTER TABLE "news_items"
  ADD COLUMN "sentimentLabel" "SentimentLabel",
  ADD COLUMN "sentimentScore" DECIMAL(38, 18),
  ADD COLUMN "eventType" "NewsEventType";
