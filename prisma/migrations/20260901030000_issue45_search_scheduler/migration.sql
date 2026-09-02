-- AlterTable
ALTER TABLE "experiments" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "experiments_isPinned_idx" ON "experiments"("isPinned");
