-- CreateTable
CREATE TABLE "food_nutrition_facts" (
    "id" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "energyKcalPer100g" DOUBLE PRECISION NOT NULL,
    "proteinGPer100g" DOUBLE PRECISION NOT NULL,
    "carbohydratesGPer100g" DOUBLE PRECISION NOT NULL,
    "fatGPer100g" DOUBLE PRECISION NOT NULL,
    "fiberGPer100g" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_nutrition_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_nutrition_facts_foodId_key" ON "food_nutrition_facts"("foodId");

-- AddForeignKey
ALTER TABLE "food_nutrition_facts" ADD CONSTRAINT "food_nutrition_facts_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
