-- AlterTable
ALTER TABLE "leaderboard" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leaderboard_entries" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "search_runs" ADD COLUMN     "datasetSnapshotId" UUID,
ALTER COLUMN "searchConfig" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "system_settings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_datasetSnapshotId_fkey" FOREIGN KEY ("datasetSnapshotId") REFERENCES "dataset_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "event_outbox_dispatch_idx" RENAME TO "event_outbox_publishedAt_deadLetteredAt_nextAttemptAt_creat_idx";

-- RenameIndex
ALTER INDEX "strategy_versions_ownerId_strategyDefinitionId_canonicalId_key" RENAME TO "strategy_versions_ownerId_strategyDefinitionId_canonicalIde_key";
