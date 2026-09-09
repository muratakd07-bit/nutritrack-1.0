import {
  foodRecognitionSource as defaultRecognitionSource,
  type FoodRecognitionInput,
  type FoodRecognitionSource,
} from "./foodRecognition";
import { rawFoodRecognitionResultSchema } from "@/lib/validation/foodRecognition";
import {
  matchLabelToFoods,
  type FoodCandidateMatch,
} from "@/domain/foods/foodMatcher";

const LOW_CONFIDENCE_THRESHOLD = 0.5;
const AMBIGUITY_CONFIDENCE_GAP = 0.15;
/** Bir etiket için en fazla kaç food_id adayı denenir (maliyet/gürültü kontrolü). */
const MAX_LABELS_TO_MATCH = 3;

export interface AnalyzedCandidate extends FoodCandidateMatch {
  /** AI'nin bu food_id'yi önermesine yol açan orijinal etiket. */
  label: string;
  /** AI'nin bu etiket için kendi güven skoru — match_score'dan AYRIDIR. */
  ai_confidence: number;
}

export interface PhotoAnalysisResult {
  candidates: AnalyzedCandidate[];
  estimated_weight_g: number;
  visual_description: string;
  is_ambiguous: boolean;
  is_low_confidence: boolean;
  is_unrecognized: boolean;
  /**
   * true ise: arayüz otomatik/varsayılan bir seçim yapmadan ÖNCE
   * kullanıcıya adayları göstermeli ve açık bir seçim istemelidir. AI
   * seviyesindeki belirsizlik/düşük güven (`is_ambiguous`/`is_low_confidence`/
   * `is_unrecognized`) YA DA FoodMatcher seviyesindeki belirsizlik (bkz.
   * FoodCandidateMatch.requires_user_confirmation — ör. bir USDA fallback
   * eşleşmesi) varsa true olur.
   */
  requires_user_confirmation: boolean;
}

export interface PhotoAnalysisDeps {
  recognitionSource?: FoodRecognitionSource;
}

/**
 * Fotoğraf analizi orkestrasyonu: AI → doğrulama → food eşleştirme →
 * belirsizlik/düşük-güven tespiti.
 *
 * KRİTİK: Bu fonksiyon HİÇBİR MealItem OLUŞTURMAZ, HİÇBİR nutrition
 * değeri HESAPLAMAZ. Yalnızca kullanıcının onaylayacağı/düzelteceği bir
 * ÖNERİ üretir. Sonucun `MealItemInput`'a dönüşmesi tamamen ayrı, kullanıcı
 * onaylı bir adımdır (bkz. app/api/meals/route.ts — değişmedi).
 */
export async function analyzeFoodPhoto(
  input: FoodRecognitionInput,
  deps: PhotoAnalysisDeps = {},
): Promise<PhotoAnalysisResult> {
  const recognitionSource = deps.recognitionSource ?? defaultRecognitionSource;

  const raw = await recognitionSource.recognizeFood(input);

  // AI çıktısına KÖRÜ KÖRÜNE GÜVENME: şekil ve aralık doğrulaması. Şemayı
  // geçmeyen bir yanıt burada REDDEDİLİR (ZodError) — "en iyi çaba" ile
  // düzeltilip kullanılmaz.
  const validated = rawFoodRecognitionResultSchema.parse(raw);

  const sortedLabels = [...validated.candidate_labels].sort(
    (a, b) => b.confidence - a.confidence,
  );
  const topConfidence = sortedLabels[0]?.confidence ?? 0;
  const secondConfidence = sortedLabels[1]?.confidence ?? 0;

  const candidates: AnalyzedCandidate[] = [];
  for (const labelInfo of sortedLabels.slice(0, MAX_LABELS_TO_MATCH)) {
    const matches = await matchLabelToFoods(labelInfo.label);
    for (const match of matches) {
      candidates.push({
        ...match,
        label: labelInfo.label,
        ai_confidence: labelInfo.confidence,
      });
    }
  }

  const isAmbiguous =
    sortedLabels.length >= 2 &&
    topConfidence - secondConfidence < AMBIGUITY_CONFIDENCE_GAP;
  const isLowConfidence = topConfidence < LOW_CONFIDENCE_THRESHOLD;
  const isUnrecognized = candidates.length === 0;

  return {
    candidates,
    estimated_weight_g: validated.estimated_weight_g,
    visual_description: validated.visual_description,
    is_ambiguous: isAmbiguous,
    is_low_confidence: isLowConfidence,
    is_unrecognized: isUnrecognized,
    requires_user_confirmation:
      isAmbiguous ||
      isLowConfidence ||
      isUnrecognized ||
      candidates.some((c) => c.requires_user_confirmation),
  };
}
