import type { Food, FoodNutritionFacts } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { FoodNutritionFactsPer100g } from "@/domain/nutrition/calculation";

export interface NutritionFactsProvenance {
  source: string;
  sourceRef?: string;
}

export const foodsRepository = {
  async createFood(name: string): Promise<Food> {
    return prisma.food.create({ data: { name } });
  },

  async findById(foodId: string): Promise<Food | null> {
    return prisma.food.findUnique({ where: { id: foodId } });
  },

  /**
   * Bir Food için doğrulanmış 100g başına değerleri yazar. `upsert`
   * kullanılır: aynı food_id için tekrar çağrılırsa (ör. veri düzeltmesi)
   * mevcut kayıt güncellenir — ama bu, o ana kadar oluşturulmuş MealItem
   * snapshot'larını ASLA etkilemez (onlar zaten kendi kopyalarını taşır).
   */
  async upsertNutritionFacts(
    foodId: string,
    facts: FoodNutritionFactsPer100g,
    provenance: NutritionFactsProvenance,
  ): Promise<FoodNutritionFacts> {
    const data = {
      energyKcalPer100g: facts.energy_kcal_per_100g,
      proteinGPer100g: facts.protein_g_per_100g,
      carbohydratesGPer100g: facts.carbohydrates_g_per_100g,
      fatGPer100g: facts.fat_g_per_100g,
      fiberGPer100g: facts.fiber_g_per_100g,
      source: provenance.source,
      sourceRef: provenance.sourceRef,
    };

    return prisma.foodNutritionFacts.upsert({
      where: { foodId },
      create: { foodId, ...data },
      update: { ...data, verifiedAt: new Date() },
    });
  },
};
