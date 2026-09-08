/**
 * ADIM 16 — nutrition source of truth sözleşmesi için paylaşılan tipler.
 *
 * KRİTİK KURAL: Bu dosyadaki `CalculatedNutrition` şekli, NutriTrack'teki
 * TEK nutrition sonucu kaynağıdır. Bu tipin alanlarını dolduran değerler
 * yalnızca domain/nutrition/contract.ts üzerinden gelebilir. Başka hiçbir
 * modül (frontend, rapor, coach, analytics, notification) bu alanları
 * kendi hesabıyla üretemez veya değiştiremez.
 *
 * Alan adları kasıtlı olarak snake_case'tir: ADIM 16 sözleşmesinin dış
 * yüzeyini (ör. harici bir servis/AI'dan gelecek JSON) birebir yansıtır.
 * İç kalıcı katman (Prisma) camelCase kullanır; ikisi arasındaki tek
 * dönüşüm noktası domain/nutrition/contract.ts içindeki mapper'dır.
 */
import type { MealType } from "./meal";

export interface NutritionCalculationInput {
  food_id: string;
  consumed_weight_g: number;
  meal_type: MealType;
}

export interface CalculatedNutrition {
  energy_kcal: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  fiber_g: number;
}
