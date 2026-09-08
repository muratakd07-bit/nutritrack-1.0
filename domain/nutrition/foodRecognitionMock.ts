import type {
  FoodRecognitionInput,
  FoodRecognitionRawResult,
  FoodRecognitionSource,
} from "./foodRecognition";

/**
 * Test/geliştirme amaçlı, tamamen deterministik sahte (mock) sağlayıcı.
 * ASLA production varsayılanı DEĞİLDİR (bkz. foodRecognition.ts) — yalnızca
 * testlerde dependency injection ile veya `AI_FOOD_RECOGNITION_MODE=mock`
 * açıkça set edildiğinde (bkz. app/api/meals/analyze-photo/route.ts)
 * kullanılır.
 */
export class MockFoodRecognitionSource implements FoodRecognitionSource {
  constructor(private readonly fixedResult: FoodRecognitionRawResult) {}

  async recognizeFood(): Promise<FoodRecognitionRawResult> {
    return this.fixedResult;
  }
}

const CANNED_RESULTS: FoodRecognitionRawResult[] = [
  {
    candidate_labels: [
      { label: "grilled chicken breast", confidence: 0.91 },
      { label: "roasted turkey breast", confidence: 0.42 },
    ],
    estimated_weight_g: 150,
    visual_description: "Griddle-marked chicken breast on a white plate.",
  },
  {
    candidate_labels: [{ label: "broccoli", confidence: 0.88 }],
    estimated_weight_g: 90,
    visual_description: "A small portion of steamed broccoli florets.",
  },
  {
    candidate_labels: [
      { label: "grilled salmon", confidence: 0.55 },
      { label: "grilled trout", confidence: 0.5 },
    ],
    estimated_weight_g: 120,
    visual_description: "A pink-fleshed grilled fish fillet.",
  },
];

/**
 * Aynı görsel için her zaman aynı sonucu üretir (deterministik), ama farklı
 * girdiler (base64 uzunluğuna göre) birkaç sabit sonuç arasında seçim
 * yapar — tamamen sahte veriyi tek bir örnekle sınırlamamak için basit bir
 * çeşitlendirme (gerçek bir görüntü analizi DEĞİLDİR).
 */
export function createDeterministicMockSource(
  input?: FoodRecognitionInput,
): MockFoodRecognitionSource {
  const index = input
    ? input.image_base64.length % CANNED_RESULTS.length
    : 0;
  return new MockFoodRecognitionSource(CANNED_RESULTS[index]);
}
