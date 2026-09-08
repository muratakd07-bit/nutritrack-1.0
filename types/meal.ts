/**
 * Meal domain — paylaşılan tipler.
 */
import type { CalculatedNutrition } from "./nutrition";

export const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export const RECORD_STATUSES = ["ACTIVE", "DELETED"] as const;

export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** Kullanıcıdan (client) gelen ham girdi — validation'dan önceki şekil. */
export interface MealItemInput {
  food_id: string;
  consumed_weight_g: number;
  meal_type: MealType;
  /** Çift gönderimi engellemek için istemci tarafından üretilen anahtar. */
  idempotency_key?: string;
}

/** Kalıcı katmandaki bir meal item — ADIM 16 çıktısının snapshot'ını içerir. */
export interface MealItemRecord {
  id: string;
  meal_id: string;
  user_id: string;
  food_id: string;
  consumed_weight_g: number;
  meal_type: MealType;
  calculated_nutrition: CalculatedNutrition;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}
