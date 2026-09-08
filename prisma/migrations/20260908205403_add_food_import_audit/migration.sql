-- CreateTable
CREATE TABLE "food_import_runs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "mappingErrorCount" INTEGER NOT NULL,
    "details" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "food_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_nutrition_facts_source_sourceRef_key" ON "food_nutrition_facts"("source", "sourceRef");
