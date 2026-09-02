ALTER TABLE "news_items"
  ADD CONSTRAINT "news_items_sentiment_fields_consistent"
  CHECK (
    ("sentimentLabel" IS NULL AND "sentimentScore" IS NULL AND "eventType" IS NULL)
    OR
    ("sentimentLabel" IS NOT NULL AND "sentimentScore" IS NOT NULL AND "eventType" IS NOT NULL)
  ),
  ADD CONSTRAINT "news_items_sentiment_score_range"
  CHECK ("sentimentScore" IS NULL OR "sentimentScore" BETWEEN -1 AND 1);
