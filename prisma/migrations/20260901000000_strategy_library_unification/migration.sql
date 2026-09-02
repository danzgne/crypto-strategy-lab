-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('USER_PROMPT', 'WEB_IMPORT', 'MANUAL');
CREATE TYPE "RecordKind" AS ENUM ('LIBRARY_ENTRY', 'BACKTEST_TARGET', 'SEARCH_CANDIDATE');

-- AlterTable: sourceInput becomes nullable ahead of the backfill below, which needs to null it out
ALTER TABLE "strategy_definitions" ALTER COLUMN "sourceInput" DROP NOT NULL;

-- Backfill the two fake-provenance patterns #35 and #37 wrote before this ticket existed.
-- A forked/tuned/composite entry has no real prompt or URL, so its sourceInput becomes null
-- rather than keeping text that was never actually typed by a user.
UPDATE "strategy_definitions"
SET "source" = 'MANUAL', "sourceInput" = NULL
WHERE "sourceInput" = "name" OR "sourceInput" LIKE 'Manual backtest target for %';

-- AlterTable: source becomes an enum
ALTER TABLE "strategy_definitions"
  ALTER COLUMN "source" TYPE "Provenance" USING "source"::"Provenance";

-- AlterTable: isPrivate (boolean) becomes recordKind (enum), plus archivedAt
ALTER TABLE "strategy_definitions"
  ADD COLUMN "recordKind" "RecordKind" NOT NULL DEFAULT 'LIBRARY_ENTRY',
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3);

UPDATE "strategy_definitions" SET "recordKind" = 'BACKTEST_TARGET' WHERE "isPrivate" = true;

ALTER TABLE "strategy_definitions" DROP COLUMN "isPrivate";

-- Rescope strategy_versions uniqueness from (ownerId, canonicalIdentity) to
-- (ownerId, strategyDefinitionId, canonicalIdentity), so editing an entry always appends a
-- version and two entries may legitimately converge on the same parameters. Legacy
-- canonicalIdentity nulls (and the "private:" prefix #37 used to dodge the old per-owner-global
-- index) are left as-is: they self-heal the next time each row is saved.
DROP INDEX "strategy_versions_ownerId_canonicalIdentity_key";
CREATE UNIQUE INDEX "strategy_versions_ownerId_strategyDefinitionId_canonicalId_key"
  ON "strategy_versions" ("ownerId", "strategyDefinitionId", "canonicalIdentity");
