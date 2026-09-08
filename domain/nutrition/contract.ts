import type {
  CalculatedNutrition,
  NutritionCalculationInput,
} from "@/types/nutrition";
import { nutritionRepository } from "./repository";
import { scaleNutritionFactsToWeight } from "./calculation";

/**
 * ADIM 16 — NutriTrack'in TEK nutrition source of truth sözleşmesi.
 *
 * Bu arayüzü implemente eden servis, NutriTrack genelinde enerji/protein/
 * karbonhidrat/yağ/fiber değerlerini üretebilecek TEK yerdir.
 *
 * Bu sınırı ihlal etmeyin:
 *   - Frontend bu sonuçları kendi matematiğiyle üretemez/değiştiremez.
 *   - Rapor, coach, analytics, notification modülleri yalnızca ADIM 16'nın
 *     ürettiği (ve MealItem üzerinde snapshot'lanmış) değerleri okuyabilir,
 *     yeniden hesaplayamaz.
 *   - Toplama/aggregation (ör. günlük toplam) bu kuralı ihlal etmez, çünkü
 *     zaten hesaplanmış değerleri topluyor olmak yeni bir nutrition sonucu
 *     ÜRETMEK değildir — bkz. domain/reports/dailySummary.ts.
 *   - `input.consumed_weight_g` HER ZAMAN kullanıcı tarafından doğrulanmış
 *     ağırlıktır — bir AI tahmini (bkz. domain/nutrition/foodRecognition.ts)
 *     asla doğrudan buraya girmez.
 */
export interface NutritionSourceOfTruth {
  getCalculatedNutrition(
    input: NutritionCalculationInput,
  ): Promise<CalculatedNutrition>;
}

/**
 * `food_id` için doğrulanmış besin değeri (FoodNutritionFacts) henüz
 * girilmemiş. Bu, "ADIM 16 implemente edilmedi" değil — hesaplama
 * MEKANİZMASI tam olarak çalışıyor, yalnızca bu belirli besin için gerçek
 * veri henüz sisteme (bkz. domain/foods/service.ts, ADMIN-only) girilmemiş.
 * Sessizce uydurma bir değer döndürmek yerine bu hata fırlatılır.
 */
export class FoodNutritionFactsNotFoundError extends Error {
  constructor(foodId: string) {
    super(
      `food_id=${foodId} için doğrulanmış besin değeri (FoodNutritionFacts) ` +
        `bulunamadı. Gerçek veri kaynağı doğrulanmadan bu değer uydurulmaz — ` +
        `bkz. domain/foods/service.ts (ADMIN tarafından doğrulanmış veri girişi).`,
    );
    this.name = "FoodNutritionFactsNotFoundError";
  }
}

/**
 * Gerçek (production) implementasyon: `food_id`'nin doğrulanmış 100g başına
 * değerlerini okur ve `consumed_weight_g`'ye deterministik olarak ölçekler
 * (bkz. domain/nutrition/calculation.ts). Facts kaydı yoksa
 * `FoodNutritionFactsNotFoundError` fırlatır — asla varsayılan/tahmini bir
 * değerle devam etmez.
 */
export const nutritionSourceOfTruth: NutritionSourceOfTruth = {
  async getCalculatedNutrition(input) {
    const facts = await nutritionRepository.getFoodNutritionFacts(
      input.food_id,
    );

    if (!facts) {
      throw new FoodNutritionFactsNotFoundError(input.food_id);
    }

    return scaleNutritionFactsToWeight(facts, input.consumed_weight_g);
  },
};
