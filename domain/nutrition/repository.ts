import { prisma } from "@/lib/db/prisma";
import type { FoodNutritionFactsPer100g } from "./calculation";

export const nutritionRepository = {
  /** Bir Food için doğrulanmış 100g başına değerleri döner; yoksa `null`. */
  async getFoodNutritionFacts(
    foodId: string,
  ): Promise<FoodNutritionFactsPer100g | null> {
    const facts = await prisma.foodNutritionFacts.findUnique({
      where: { foodId },
    });

    if (!facts) {
      return null;
    }

    return {
      energy_kcal_per_100g: facts.energyKcalPer100g,
      protein_g_per_100g: facts.proteinGPer100g,
      carbohydrates_g_per_100g: facts.carbohydratesGPer100g,
      fat_g_per_100g: facts.fatGPer100g,
      fiber_g_per_100g: facts.fiberGPer100g,
    };
  },
};
