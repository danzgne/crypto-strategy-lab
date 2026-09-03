-- AlterTable
ALTER TABLE "experiments" ADD COLUMN     "buildRevision" TEXT,
ADD COLUMN     "generationOrdinal" INTEGER,
ADD COLUMN     "generatorAlgorithm" TEXT,
ADD COLUMN     "generatorSeed" INTEGER,
ADD COLUMN     "generatorVersion" TEXT,
ADD COLUMN     "strategyImplementationVersion" TEXT;
