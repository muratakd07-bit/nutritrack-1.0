import type {
  CalculatedNutrition,
  NutritionCalculationInput,
} from "@/types/nutrition";

/**
 * ADIM 16 — NutriTrack'in TEK nutrition source of truth sözleşmesi.
 *
 * Bu arayüzü implemente eden servis, NutriTrack genelinde enerji/protein/
 * karbonhidrat/yağ/fiber değerlerini üretebilecek TEK yerdir. Bu dosya
 * KASITLI OLARAK gerçek bir hesaplama algoritması İÇERMEZ: gerçek besin
 * veritabanı ve hesaplama kuralları henüz bu projede doğrulanmamıştır.
 *
 * Bu sınırı ihlal etmeyin:
 *   - Frontend bu sonuçları kendi matematiğiyle üretemez/değiştiremez.
 *   - Rapor, coach, analytics, notification modülleri yalnızca ADIM 16'nın
 *     ürettiği (ve MealItem üzerinde snapshot'lanmış) değerleri okuyabilir,
 *     yeniden hesaplayamaz.
 *   - Toplama/aggregation (ör. günlük toplam) bu kuralı ihlal etmez, çünkü
 *     zaten hesaplanmış değerleri topluyor olmak yeni bir nutrition sonucu
 *     ÜRETMEK değildir — bkz. domain/reports/dailySummary.ts.
 */
export interface NutritionSourceOfTruth {
  getCalculatedNutrition(
    input: NutritionCalculationInput,
  ): Promise<CalculatedNutrition>;
}

/**
 * ADIM 16 henüz bu projede implemente edilmedi (gerçek food database ve
 * hesaplama kaynağı doğrulanmadı). Bu hata, sözleşmenin çağrıldığını ama
 * arkasında henüz gerçek bir kaynak olmadığını AÇIKÇA belli eder — sessizce
 * uydurma bir değer döndürmek yerine.
 */
export class NutritionSourceNotImplementedError extends Error {
  constructor(input: NutritionCalculationInput) {
    super(
      `ADIM 16 nutrition source of truth henüz implemente edilmedi. ` +
        `food_id=${input.food_id} için calculated_nutrition üretilemiyor. ` +
        `Gerçek veri kaynağı doğrulanmadan bu değer uydurulmamalıdır.`,
    );
    this.name = "NutritionSourceNotImplementedError";
  }
}

/**
 * Varsayılan (production) implementasyon: ADIM 16 bağlanana kadar bilinçli
 * olarak "not implemented" hatası fırlatır. Böylece yanlışlıkla uydurma bir
 * değerle çağrı zinciri devam edemez; hata, çağıran API katmanında 501
 * (Not Implemented) olarak yüzeye çıkar.
 */
export const nutritionSourceOfTruth: NutritionSourceOfTruth = {
  async getCalculatedNutrition(input) {
    throw new NutritionSourceNotImplementedError(input);
  },
};
