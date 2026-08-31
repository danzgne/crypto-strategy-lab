-- CreateEnum
CREATE TYPE "NewsProviderType" AS ENUM ('RSS', 'WEBSITE', 'HTML');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "news_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "providerType" "NewsProviderType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "news_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_items" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "relatedCoins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "newsSourceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_crawl_attempts" (
    "id" UUID NOT NULL,
    "newsSourceId" UUID NOT NULL,
    "status" "CrawlStatus" NOT NULL,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsPersisted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "crawledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_crawl_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_items_url_key" ON "news_items"("url");

-- CreateIndex
CREATE INDEX "news_items_publishedAt_idx" ON "news_items"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "news_items_newsSourceId_idx" ON "news_items"("newsSourceId");

-- CreateIndex
CREATE INDEX "news_crawl_attempts_newsSourceId_crawledAt_idx" ON "news_crawl_attempts"("newsSourceId", "crawledAt");

-- AddForeignKey
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_newsSourceId_fkey" FOREIGN KEY ("newsSourceId") REFERENCES "news_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_crawl_attempts" ADD CONSTRAINT "news_crawl_attempts_newsSourceId_fkey" FOREIGN KEY ("newsSourceId") REFERENCES "news_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
