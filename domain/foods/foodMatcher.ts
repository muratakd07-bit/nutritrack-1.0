import { foodsRepository } from "./repository";
import { searchUsdaFoods, getUsdaFoodsByIds, UsdaApiError } from "./usdaClient";
import { importUsdaFoods, USDA_SOURCE } from "./importUsdaFoods";

export type FoodMatchSource = "LOCAL" | "USDA_FDC";

export interface FoodCandidateMatch {
  food_id: string;
  name: string;
  match_source: FoodMatchSource;
  /** İsim benzerliğine dayalı basit bir skor (0–1) — AI'nin kendi
   * güven skorundan (confidence) TAMAMEN AYRIDIR. */
  match_score: number;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "with",
  "and",
  "raw",
  "cooked",
]);

function significantWords(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** En az bir USDA adayını import ederek gerçek, kullanılabilir bir food_id'ye çevirir. */
async function tryUsdaFallback(label: string): Promise<FoodCandidateMatch[]> {
  try {
    const results = await searchUsdaFoods(label, ["Foundation", "SR Legacy"], 5);
    const top = results.slice(0, 1); // rate-limit etkisini sınırlamak için tek aday
    if (top.length === 0) return [];

    const alreadyImported = await foodsRepository.findFactsBySourceRef(
      USDA_SOURCE,
      String(top[0].fdcId),
    );
    if (alreadyImported) {
      const food = await foodsRepository.findById(alreadyImported.foodId);
      if (!food) return [];
      return [
        {
          food_id: food.id,
          name: food.name,
          match_source: "USDA_FDC",
          match_score: 0.5,
        },
      ];
    }

    const fetched = await getUsdaFoodsByIds([top[0].fdcId]);
    const summary = await importUsdaFoods([top[0].fdcId], fetched);
    if (summary.importedCount === 0) return [];

    const imported = await foodsRepository.findFactsBySourceRef(
      USDA_SOURCE,
      String(top[0].fdcId),
    );
    if (!imported) return [];
    const food = await foodsRepository.findById(imported.foodId);
    if (!food) return [];

    return [
      {
        food_id: food.id,
        name: food.name,
        match_source: "USDA_FDC",
        match_score: 0.5,
      },
    ];
  } catch (error) {
    // USDA rate limit / ağ hatası: eşleştirmeyi tamamen BAŞARISIZ etmez,
    // yalnızca bu kaynaktan aday sunulamaz (bkz. domain/nutrition/photoAnalysis.ts
    // — yerel eşleşme varsa akış yine de devam eder).
    if (error instanceof UsdaApiError) {
      return [];
    }
    throw error;
  }
}

/**
 * AI'nin döndürdüğü serbest metin bir besin ismini (`label`), gerçek
 * `Food` kayıtlarıyla eşleştirir.
 *
 * KURAL: Bu fonksiyon nutrition değerlerini AI'dan ALMAZ — yalnızca bir
 * KİMLİK (food_id) çözer. Nutrition, her zaman o food_id üzerinden ADIM 16
 * sözleşmesiyle ayrıca hesaplanır.
 *
 * Sıra: önce yerel veritabanı (hızlı, ağ gerektirmez). Yerelde eşleşme
 * yoksa KONTROLLÜ bir USDA fallback denenir (tek aday, hataya toleranslı).
 */
export async function matchLabelToFoods(
  label: string,
): Promise<FoodCandidateMatch[]> {
  const words = significantWords(label);
  if (words.length === 0) return [];

  const localMatches = await foodsRepository.searchByNameWords(words, 20);

  if (localMatches.length > 0) {
    return localMatches
      .map((food) => {
        const nameLower = food.name.toLowerCase();
        const matchCount = words.filter((w) => nameLower.includes(w)).length;
        return {
          food_id: food.id,
          name: food.name,
          match_source: "LOCAL" as const,
          match_score: matchCount / words.length,
        };
      })
      .filter((m) => m.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 5);
  }

  return tryUsdaFallback(label);
}
