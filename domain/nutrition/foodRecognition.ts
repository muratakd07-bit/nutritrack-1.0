/**
 * Fotoğraftan besin tanıma (AI) sınırı — ADIM 16'nın hesaplama
 * sözleşmesinden (contract.ts) BİLİNÇLİ OLARAK AYRI.
 *
 * KESİN KURAL: Bu modülün ürettiği `FoodRecognitionEstimate` DANIŞMA
 * amaçlıdır ve ASLA doğrudan `NutritionSourceOfTruth.getCalculatedNutrition`
 * için girdi olarak kullanılamaz. `estimated_weight_g`, kullanıcı tarafından
 * gözden geçirilip onaylanmadan (veya düzeltilmeden) bir
 * `consumed_weight_g` haline gelemez — bkz. types/meal.ts → `MealItemInput`
 * (yalnızca doğrulanmış `consumed_weight_g` kabul eder).
 *
 * Akış: fotoğraf → (bu sözleşme) → tahmini food_id + estimated_weight_g →
 * KULLANICI ONAYI/DÜZELTMESİ → MealItemInput (consumed_weight_g) →
 * domain/nutrition/contract.ts.
 *
 * Henüz bir görsel tanıma sağlayıcısı (vendor/model) bu projeye
 * bağlanmadı — varsayılan implementasyon bilinçli olarak
 * `FoodRecognitionNotImplementedError` fırlatır.
 */

export interface FoodRecognitionInput {
  /** Yüklenmiş görselin depolama referansı (ör. Supabase Storage path). */
  image_ref: string;
}

export interface FoodRecognitionEstimate {
  /** AI'nin tahmin ettiği besin kimliği — DOĞRULANMAMIŞ. */
  food_id: string;
  /** AI'nin tahmin ettiği ağırlık (gram) — DOĞRULANMAMIŞ, consumed_weight_g DEĞİLDİR. */
  estimated_weight_g: number;
  /** Modelin kendi güven skoru, 0–1 arası. */
  confidence: number;
}

export interface FoodRecognitionSource {
  recognizeFood(
    input: FoodRecognitionInput,
  ): Promise<FoodRecognitionEstimate>;
}

export class FoodRecognitionNotImplementedError extends Error {
  constructor() {
    super(
      "Fotoğraftan besin tanıma (AI) henüz bu projeye bağlanmadı. Bu " +
        "aşamada besin girişi yalnızca doğrulanmış (manuel) food_id + " +
        "consumed_weight_g ile yapılabilir — bkz. types/meal.ts.",
    );
    this.name = "FoodRecognitionNotImplementedError";
  }
}

export const foodRecognitionSource: FoodRecognitionSource = {
  async recognizeFood() {
    throw new FoodRecognitionNotImplementedError();
  },
};
