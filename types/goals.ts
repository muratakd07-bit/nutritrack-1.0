/**
 * Günlük nutrition hedefleri — paylaşılan tipler.
 *
 * KURAL: Bu hedefleri yalnızca trainer veya sistem (uygulama varsayılanı)
 * belirleyebilir. AI/coach modülleri bu değerleri yalnızca okuyabilir.
 * bkz. domain/goals/service.ts ve domain/coach/README.md.
 */

export const GOAL_SET_BY_VALUES = ["SYSTEM", "TRAINER"] as const;

export type GoalSetBy = (typeof GOAL_SET_BY_VALUES)[number];

export interface DailyNutritionGoals {
  energy_kcal: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
}

export interface DailyNutritionGoalRecord extends DailyNutritionGoals {
  id: string;
  user_id: string;
  set_by: GoalSetBy;
  set_by_trainer_id: string | null;
  effective_from: string;
}
