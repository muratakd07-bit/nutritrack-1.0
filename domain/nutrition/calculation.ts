import type { CalculatedNutrition } from "@/types/nutrition";

/**
 * Bir Food'un 100 gram başına doğrulanmış besin değerleri —
 * `FoodNutritionFacts` tablosunun uygulama-katmanı karşılığı.
 */
export interface FoodNutritionFactsPer100g {
  energy_kcal_per_100g: number;
  protein_g_per_100g: number;
  carbohydrates_g_per_100g: number;
  fat_g_per_100g: number;
  fiber_g_per_100g: number;
}

/**
 * ADIM 16'nın gerçek hesaplama fonksiyonu: 100g başına doğrulanmış
 * değerleri, tüketilen ağırlığa (gram) doğrusal olarak ölçekler.
 *
 * KESİN KURALLAR:
 *  - SAF (pure) bir fonksiyondur: DB'ye erişmez, yan etkisi yoktur, aynı
 *    girdi HER ZAMAN aynı çıktıyı üretir (deterministik).
 *  - `consumedWeightG` burada ZATEN DOĞRULANMIŞ (kullanıcı onaylı) ağırlık
 *    olmalıdır — bir AI tahmini (`estimated_weight_g`) burada KULLANILMAZ.
 *    Ayrım domain/nutrition/foodRecognition.ts'te açıkça yapılır.
 *  - Sonuç, ondalık gösterim tutarlılığı için 1 ondalık basamağa
 *    yuvarlanır (aşağıdaki `roundToOneDecimal`) — bu, kayan nokta
 *    gürültüsünü de temizler ve "aynı girdi → aynı çıktı" garantisini
 *    ondalık basamak seviyesinde de sağlar.
 */
export function scaleNutritionFactsToWeight(
  factsPer100g: FoodNutritionFactsPer100g,
  consumedWeightG: number,
): CalculatedNutrition {
  const factor = consumedWeightG / 100;

  return {
    energy_kcal: roundToOneDecimal(factsPer100g.energy_kcal_per_100g * factor),
    protein_g: roundToOneDecimal(factsPer100g.protein_g_per_100g * factor),
    carbohydrates_g: roundToOneDecimal(
      factsPer100g.carbohydrates_g_per_100g * factor,
    ),
    fat_g: roundToOneDecimal(factsPer100g.fat_g_per_100g * factor),
    fiber_g: roundToOneDecimal(factsPer100g.fiber_g_per_100g * factor),
  };
}

/** Nutrition değerleri için standart yuvarlama kuralı: 1 ondalık basamak. */
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
