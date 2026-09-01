-- AlterTable
ALTER TABLE "strategy_definitions"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'USER_PROMPT',
  ADD COLUMN "sourceInput" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "strategy_definitions" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "strategy_definitions" ALTER COLUMN "sourceInput" DROP DEFAULT;

-- AlterTable
ALTER TABLE "strategy_versions"
  ADD COLUMN "versionTag" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "libraryVersion" TEXT NOT NULL DEFAULT '1.0.0';

ALTER TABLE "strategy_versions" ALTER COLUMN "versionTag" DROP DEFAULT;
ALTER TABLE "strategy_versions" ALTER COLUMN "libraryVersion" DROP DEFAULT;
