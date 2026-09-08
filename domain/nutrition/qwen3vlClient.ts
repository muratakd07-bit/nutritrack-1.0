import type {
  FoodRecognitionInput,
  FoodRecognitionRawResult,
  FoodRecognitionSource,
} from "./foodRecognition";
import { FoodRecognitionNotImplementedError } from "./foodRecognition";

/**
 * Qwen3-VL (görsel-dil modeli) tabanlı gerçek besin tanıma istemcisi.
 *
 * ÖNEMLİ — DOĞRULANMAMIŞ ABSTRACTION: USDA entegrasyonunun (ADIM 26) aksine,
 * bu istek/yanıt şekli GERÇEK bir Qwen3-VL endpoint'ine karşı canlı olarak
 * test EDİLEMEDİ (henüz bir endpoint bu projeye bağlı değil). Aşağıdaki
 * istek gövdesi, yaygın OpenAI-uyumlu vision-language API konvansiyonuna
 * dayanan MAKUL bir varsayımdır — gerçek bir Qwen3-VL endpoint'i
 * bağlandığında bu dosyadaki istek/yanıt eşlemesi MUTLAKA gerçek API
 * dokümantasyonuna karşı doğrulanıp gerekirse güncellenmelidir. Bu yüzden
 * bu entegrasyon "production-ready" DEĞİLDİR — bkz. domain/nutrition/README.md.
 *
 * Ortam değişkenleri:
 *  - QWEN3_VL_ENDPOINT_URL (zorunlu, aksi halde foodRecognition.ts hiç bu
 *    sınıfı örneklemez)
 *  - QWEN3_VL_API_KEY (opsiyonel — endpoint'e göre gerekebilir)
 */
export class Qwen3VLFoodRecognitionSource implements FoodRecognitionSource {
  async recognizeFood(
    input: FoodRecognitionInput,
  ): Promise<FoodRecognitionRawResult> {
    const endpoint = process.env.QWEN3_VL_ENDPOINT_URL;
    if (!endpoint) {
      throw new FoodRecognitionNotImplementedError();
    }
    const apiKey = process.env.QWEN3_VL_API_KEY;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        task: "food_recognition",
        image: { base64: input.image_base64, mime_type: input.mime_type },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Qwen3-VL API hatası: ${response.status} ${response.statusText}`,
      );
    }

    // NOT: Burada dönen JSON'un FoodRecognitionRawResult şeklinde olduğu
    // VARSAYILIYOR — gerçek endpoint bağlandığında doğrulanmalı. Şeklin
    // yanlış çıkması ihtimaline karşı, bu fonksiyonun çağıranı
    // (domain/nutrition/photoAnalysis.ts) sonucu HER ZAMAN zod ile
    // yeniden doğrular (AI çıktısına körü körüne güvenilmez).
    return response.json();
  }
}
