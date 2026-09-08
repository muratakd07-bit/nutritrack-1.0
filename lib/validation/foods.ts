import { z } from "zod";

export const foodNutritionFactsInputSchema = z.object({
  energy_kcal_per_100g: z.number().finite().nonnegative(),
  protein_g_per_100g: z.number().finite().nonnegative(),
  carbohydrates_g_per_100g: z.number().finite().nonnegative(),
  fat_g_per_100g: z.number().finite().nonnegative(),
  fiber_g_per_100g: z.number().finite().nonnegative(),
});

/**
 * ADMIN-only besin oluşturma isteği. `source`/`source_ref` zorunlu/opsiyonel
 * tutulur ki her kayıt izlenebilir olsun — bkz. domain/foods/service.ts.
 */
export const createVerifiedFoodInputSchema = z.object({
  name: z.string().trim().min(1, "name boş olamaz").max(200),
  facts: foodNutritionFactsInputSchema,
  source: z.string().trim().min(1, "source boş olamaz").max(100),
  source_ref: z.string().trim().max(200).optional(),
});

export type CreateVerifiedFoodInput = z.infer<
  typeof createVerifiedFoodInputSchema
>;
