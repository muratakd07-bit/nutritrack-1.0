import type { DailyNutritionGoalRecord } from "@/types/goals";
import type { MealType } from "@/types/meal";

/** GET /api/meals?date=... yanıtındaki bir kayıt (Prisma alan adları). */
export interface MealItemView {
  id: string;
  foodId: string;
  mealType: MealType;
  consumedWeightG: number;
  energyKcal: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG: number;
  food: { name: string };
}

export interface DaySummary {
  date: string;
  energy_kcal: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  fiber_g: number;
  item_count: number;
}

/** GET /api/reports/summary yanıtı. */
export interface SummaryResponse {
  goals: DailyNutritionGoalRecord | null;
  days: DaySummary[];
}
