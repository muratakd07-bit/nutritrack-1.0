import type { MealItem } from "@prisma/client";
import {
  nutritionSourceOfTruth as defaultNutritionSource,
  type NutritionSourceOfTruth,
} from "@/domain/nutrition/contract";
import { mealRepository } from "./repository";
import type { MealItemInput } from "@/types/meal";

export interface MealServiceDeps {
  nutritionSource?: NutritionSourceOfTruth;
}

/**
 * Bir kullanıcı için yeni bir meal item oluşturur.
 *
 * Akış: validate edilmiş input -> ADIM 16 sözleşmesinden calculated_nutrition
 * al -> DEĞİŞTİRMEDEN kalıcı katmana yaz. Bu fonksiyon calculated_nutrition
 * alanlarını (energy_kcal, protein_g, carbohydrates_g, fat_g, fiber_g) HİÇBİR
 * KOŞULDA kendi hesaplamaz, yuvarlamaz veya düzeltmez — ADIM 16'nın döndürdüğü
 * değer neyse o kaydedilir.
 *
 * Idempotency: `idempotency_key` verilmişse ve bu kullanıcı için daha önce
 * kullanılmışsa, yeni kayıt oluşturmak yerine mevcut kayıt döndürülür.
 *
 * User isolation: kayıt her zaman `userId` ile ilişkilendirilir; repository
 * katmanı bu değeri asla başka bir kullanıcıyla karıştırmaz.
 */
export async function createMealItemForUser(
  userId: string,
  input: MealItemInput,
  deps: MealServiceDeps = {},
): Promise<MealItem> {
  const nutritionSource = deps.nutritionSource ?? defaultNutritionSource;

  if (input.idempotency_key) {
    const existing = await mealRepository.findByIdempotencyKey(
      userId,
      input.idempotency_key,
    );
    if (existing) {
      return existing;
    }
  }

  const calculatedNutrition = await nutritionSource.getCalculatedNutrition({
    food_id: input.food_id,
    consumed_weight_g: input.consumed_weight_g,
    meal_type: input.meal_type,
  });

  return mealRepository.createMealItem({
    userId,
    foodId: input.food_id,
    consumedWeightG: input.consumed_weight_g,
    mealType: input.meal_type,
    calculatedNutrition,
    idempotencyKey: input.idempotency_key,
  });
}

/** Yalnızca istenen kullanıcıya ait meal item'ı döner; başkasınınkini asla. */
export async function getMealItemForUser(
  userId: string,
  mealItemId: string,
): Promise<MealItem | null> {
  return mealRepository.findMealItemForUser(userId, mealItemId);
}

export async function listMealItemsForUser(
  userId: string,
  range?: { from: Date; to: Date },
): Promise<MealItem[]> {
  return mealRepository.listMealItemsForUser(userId, range);
}
