import { Qwen3VLFoodRecognitionSource } from "./qwen3vlClient";

/**
 * Fotoğraftan besin tanıma (AI) sınırı — ADIM 16'nın hesaplama
 * sözleşmesinden (contract.ts) BİLİNÇLİ OLARAK AYRI.
 *
 * KESİN KURAL: Bu modülün ürettiği hiçbir değer (candidate_labels,
 * estimated_weight_g) ASLA doğrudan `NutritionSourceOfTruth.getCalculatedNutrition`
 * için girdi olarak kullanılamaz ve nutrition source of truth OLAMAZ. AI
 * yalnızca üç şeyi üretebilir: (1) aday besin İSİMLERİ (food_id DEĞİL —
 * bkz. domain/foods/foodMatcher.ts, eşleştirme ayrı bir adımdır), (2)
 * tahmini ağırlık, (3) serbest metin görsel açıklama.
 *
 * Akış: fotoğraf → (bu sözleşme) → aday isimler + tahmini ağırlık →
 * FoodMatcher (gerçek food_id'lere eşleme) → KULLANICI ONAYI/DÜZELTMESİ →
 * MealItemInput (consumed_weight_g) → domain/nutrition/contract.ts.
 * bkz. domain/nutrition/photoAnalysis.ts (orkestrasyon).
 */

export interface FoodRecognitionInput {
  /** Base64 kodlanmış görsel verisi (depolama altyapısı henüz yok). */
  image_base64: string;
  mime_type: string;
}

export interface RawCandidateLabel {
  /** AI'nin gördüğü besin için serbest metin isim — food_id DEĞİLDİR. */
  label: string;
  /** Modelin kendi güven skoru, 0–1 arası. */
  confidence: number;
}

export interface FoodRecognitionRawResult {
  /** En olasıdan en az olasıya doğru sıralı aday isimler. */
  candidate_labels: RawCandidateLabel[];
  /** AI'nin tahmin ettiği ağırlık (gram) — DOĞRULANMAMIŞ, consumed_weight_g DEĞİLDİR. */
  estimated_weight_g: number;
  /** Modelin serbest metin görsel açıklaması (kullanıcıya gösterilebilir). */
  visual_description: string;
}

export interface FoodRecognitionSource {
  recognizeFood(
    input: FoodRecognitionInput,
  ): Promise<FoodRecognitionRawResult>;
}

export class FoodRecognitionNotImplementedError extends Error {
  constructor() {
    super(
      "Fotoğraftan besin tanıma (AI) henüz gerçek bir sağlayıcıya (ör. " +
        "Qwen3-VL) bağlanmadı. QWEN3_VL_ENDPOINT_URL tanımlı değil. Bu " +
        "aşamada besin girişi yalnızca doğrulanmış (manuel) food_id + " +
        "consumed_weight_g ile yapılabilir — bkz. types/meal.ts.",
    );
    this.name = "FoodRecognitionNotImplementedError";
  }
}

const notImplementedSource: FoodRecognitionSource = {
  async recognizeFood() {
    throw new FoodRecognitionNotImplementedError();
  },
};

/**
 * Varsayılan (production) kaynak: `QWEN3_VL_ENDPOINT_URL` tanımlıysa gerçek
 * Qwen3-VL istemcisini, değilse bilinçli olarak `FoodRecognitionNotImplementedError`
 * fırlatan bir stub'ı kullanır — ADIM 16/25'teki "gerçek kaynak yoksa
 * sessizce uydurma üretme" desenini birebir tekrarlar.
 */
export const foodRecognitionSource: FoodRecognitionSource = process.env
  .QWEN3_VL_ENDPOINT_URL
  ? new Qwen3VLFoodRecognitionSource()
  : notImplementedSource;
