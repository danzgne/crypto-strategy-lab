-- AlterTable
ALTER TABLE "search_runs"
  ADD COLUMN     "seed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "nextGenerationOrdinal" INTEGER NOT NULL DEFAULT 1,
  ALTER COLUMN "algorithm" SET DEFAULT 'random-v1';
