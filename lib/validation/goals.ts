import { z } from "zod";

/** ADIM 16 sözleşmesindeki alan adlarıyla birebir aynı — bkz. types/nutrition.ts. */
export const dailyNutritionGoalsInputSchema = z.object({
  energy_kcal: z.number().finite().positive(),
  protein_g: z.number().finite().nonnegative(),
  carbohydrates_g: z.number().finite().nonnegative(),
  fat_g: z.number().finite().nonnegative(),
  fiber_g: z.number().finite().nonnegative(),
  water_ml: z.number().finite().nonnegative(),
});

/**
 * Hedef belirleme isteği. `user_id`, hedefin belirlendiği kullanıcıdır —
 * bu değer client'tan gelir ama ASLA "kimsin" anlamında güvenilmez; API
 * katmanı bunu her zaman `resolveAssignedTrainerId` ile denetler
 * (bkz. app/api/goals/route.ts, domain/authz/service.ts).
 */
export const setGoalsInputSchema = z.object({
  user_id: z.string().trim().min(1, "user_id boş olamaz"),
  goals: dailyNutritionGoalsInputSchema,
});

export type SetGoalsInput = z.infer<typeof setGoalsInputSchema>;
