-- CreateEnum
CREATE TYPE "TemplateVersionStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- AlterTable
ALTER TABLE "news_crawl_attempts" ADD COLUMN     "avgConfidence" DECIMAL(4,3),
ADD COLUMN     "emptyFieldRate" DECIMAL(5,4),
ADD COLUMN     "malformedFieldRate" DECIMAL(5,4),
ADD COLUMN     "templateVersionId" UUID;

-- CreateTable
CREATE TABLE "extraction_template_versions" (
    "id" UUID NOT NULL,
    "newsSourceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TemplateVersionStatus" NOT NULL,
    "template" JSONB NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "basedOnVersionId" UUID,
    "projectedEmptyFieldRate" DECIMAL(5,4),
    "projectedMalformedFieldRate" DECIMAL(5,4),
    "activatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extraction_template_versions_newsSourceId_status_idx" ON "extraction_template_versions"("newsSourceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "extraction_template_versions_newsSourceId_version_key" ON "extraction_template_versions"("newsSourceId", "version");

-- CreateIndex: Prisma's schema cannot express a partial unique index, so "at most one
-- ACTIVE version per Source" is enforced here directly rather than via @@unique.
CREATE UNIQUE INDEX "extraction_template_versions_one_active_per_source"
  ON "extraction_template_versions"("newsSourceId")
  WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "news_crawl_attempts_templateVersionId_crawledAt_idx" ON "news_crawl_attempts"("templateVersionId", "crawledAt");

-- AddForeignKey
ALTER TABLE "news_crawl_attempts" ADD CONSTRAINT "news_crawl_attempts_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "extraction_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_template_versions" ADD CONSTRAINT "extraction_template_versions_newsSourceId_fkey" FOREIGN KEY ("newsSourceId") REFERENCES "news_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_template_versions" ADD CONSTRAINT "extraction_template_versions_basedOnVersionId_fkey" FOREIGN KEY ("basedOnVersionId") REFERENCES "extraction_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
