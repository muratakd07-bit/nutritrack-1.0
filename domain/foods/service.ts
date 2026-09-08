import type { Food } from "@prisma/client";
import { foodsRepository } from "./repository";
import type { FoodNutritionFactsPer100g } from "@/domain/nutrition/calculation";

export interface CreateVerifiedFoodInput {
  name: string;
  facts: FoodNutritionFactsPer100g;
  source: string;
  sourceRef?: string;
}

/**
 * Sisteme YENİ, doğrulanmış bir besin ekler.
 *
 * KRİTİK: Bu fonksiyon değerleri UYDURMAZ — çağıran taraf (yalnızca ADMIN,
 * bkz. app/api/admin/foods/route.ts) gerçek, doğrulanmış değerleri ve
 * kaynağını (`source`/`sourceRef`) sağlamakla yükümlüdür. Bu, ADIM 16'nın
 * "güvenilir food database/source" kuralının veri girişi tarafındaki
 * karşılığıdır: Claude/otomatik kod hiçbir zaman buraya bir besinin gerçek
 * kalori/makro değerini kendisi üretip yazmaz.
 */
export async function createVerifiedFood(
  input: CreateVerifiedFoodInput,
): Promise<Food> {
  const food = await foodsRepository.createFood(input.name);
  await foodsRepository.upsertNutritionFacts(food.id, input.facts, {
    source: input.source,
    sourceRef: input.sourceRef,
  });
  return food;
}
