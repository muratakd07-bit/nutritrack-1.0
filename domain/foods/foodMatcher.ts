import { foodsRepository } from "./repository";
import { searchUsdaFoods, getUsdaFoodsByIds, UsdaApiError } from "./usdaClient";
import { importUsdaFoods, USDA_SOURCE } from "./importUsdaFoods";
import {
  scoreUsdaCandidate,
  isOffTypeMatch,
  isSecondaryMentionOnly,
  MATCH_CONFIDENCE,
} from "./foodMatchScoring";

export type FoodMatchSource = "LOCAL" | "USDA_FDC";

export interface FoodCandidateMatch {
  food_id: string;
  name: string;
  match_source: FoodMatchSource;
  /** İsim benzerliğine dayalı basit bir skor (0–1) — AI'nin kendi
   * güven skorundan (confidence) TAMAMEN AYRIDIR. */
  match_score: number;
  /**
   * true ise: bu aday OTOMATİK kabul edilmemeli, kullanıcının açıkça
   * seçmesi/onaylaması istenmelidir (bkz. domain/nutrition/photoAnalysis.ts
   * → PhotoAnalysisResult.requires_user_confirmation, app/meals/add-photo).
   * Yapısal olarak zaten hiçbir analiz sonucu tek başına bir MealItem
   * oluşturmaz (bkz. app/api/meals/analyze-photo/route.ts) — bu alan, bunun
   * ÜSTÜNE, arayüzün ne zaman bir uyarı/seçim ekranı göstermesi gerektiğini
   * belirten bir sinyaldir.
   */
  requires_user_confirmation: boolean;
  /**
   * FoodMatcher yalnızca zaten doğrulanmış nutrition facts'i OLAN food'ları
   * döner (yerel arama `nutritionFacts: { isNot: null }` ile filtreler;
   * USDA adayları import edilirken facts atomik olarak birlikte yazılır) —
   * bu yüzden burada döndürülen HER aday için bu her zaman `true`'dur.
   */
  has_verified_facts: true;
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

/** Tek bir arama sayfasında (bir HTTP isteği) değerlendirilecek USDA aday sayısı. */
const USDA_SEARCH_POOL_SIZE = 10;
/** Kullanıcıya sunulacak (ve gerekiyorsa import edilecek) en fazla USDA aday sayısı. */
const USDA_MAX_CANDIDATES_TO_RETURN = 5;

/**
 * USDA arama sonuçlarını GERÇEK bir eşleşme olasılığına göre sıralar
 * (bkz. domain/foods/foodMatchScoring.ts — ADIM 27'nin canlı testinde
 * gözlemlenen gerçek bir hatayı düzeltmek için eklendi: eski kod, arama
 * sonucunun İLK elemanını sorgusuz "en iyi eşleşme" kabul ediyordu, bu da
 * "rice"→"Rice crackers" ve "salad"→"Fish, tuna salad" gibi yanlış
 * otomatik eşleşmelere yol açıyordu).
 *
 * İLK USDA sonucunu asla körü körüne kabul etmez; en iyi skorlu birden
 * fazla adayı (en fazla `USDA_MAX_CANDIDATES_TO_RETURN`) import edip
 * GERÇEK food_id'lerle birlikte döner — nihai seçim kullanıcıya bırakılır
 * (`requires_user_confirmation: true`, her zaman).
 */
async function tryUsdaFallback(label: string): Promise<FoodCandidateMatch[]> {
  try {
    const results = await searchUsdaFoods(
      label,
      ["Foundation", "SR Legacy"],
      USDA_SEARCH_POOL_SIZE,
    );
    if (results.length === 0) return [];

    const scored = results
      .map((r) => ({ ...r, score: scoreUsdaCandidate(label, r.description) }))
      .filter((r) => r.score >= MATCH_CONFIDENCE.USDA_MIN_SCORE_TO_SHOW)
      .sort((a, b) => b.score - a.score)
      .slice(0, USDA_MAX_CANDIDATES_TO_RETURN);

    if (scored.length === 0) return [];

    // Zaten import edilmiş olanları bul; edilmemişleri TEK bir bulk
    // istekte (getUsdaFoodsByIds) çek ve import et (rate-limit etkisini
    // sınırlamak için: arama + en fazla bir bulk fetch = toplam 2 istek,
    // aday sayısından BAĞIMSIZ).
    const factsByFdcId = new Map<number, { foodId: string }>();
    const toFetch: number[] = [];
    for (const s of scored) {
      const existing = await foodsRepository.findFactsBySourceRef(
        USDA_SOURCE,
        String(s.fdcId),
      );
      if (existing) {
        factsByFdcId.set(s.fdcId, existing);
      } else {
        toFetch.push(s.fdcId);
      }
    }

    if (toFetch.length > 0) {
      const fetched = await getUsdaFoodsByIds(toFetch);
      await importUsdaFoods(toFetch, fetched);
      for (const fdcId of toFetch) {
        const facts = await foodsRepository.findFactsBySourceRef(
          USDA_SOURCE,
          String(fdcId),
        );
        if (facts) factsByFdcId.set(fdcId, facts);
      }
    }

    const candidates: FoodCandidateMatch[] = [];
    for (const s of scored) {
      const facts = factsByFdcId.get(s.fdcId);
      if (!facts) continue; // mapping/import hatası — bu aday atlanır
      const food = await foodsRepository.findById(facts.foodId);
      if (!food) continue;
      candidates.push({
        food_id: food.id,
        name: food.name,
        match_source: "USDA_FDC",
        match_score: s.score,
        requires_user_confirmation: true,
        has_verified_facts: true,
      });
    }

    return candidates.sort((a, b) => b.match_score - a.match_score);
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
 * Yerel + USDA havuzları birleştirildiğinde AYNI food_id iki kez
 * görünebilir (ör. "Rice crackers" hem yerelde bulunur HEM DE USDA
 * araması tekrar döndürebilir) — bu, ADIM 28'in gerçek verilerle
 * testinde canlı olarak gözlemlendi. Sıralamadan SONRA çağrılmalıdır;
 * her food_id'nin İLK (en yüksek sortScore'lu) geçtiği yeri korur.
 */
function dedupeByFoodId<T extends { match: FoodCandidateMatch }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.match.food_id)) return false;
    seen.add(item.match.food_id);
    return true;
  });
}

/**
 * AI'nin döndürdüğü serbest metin bir besin ismini (`label`), gerçek
 * `Food` kayıtlarıyla eşleştirir.
 *
 * KURAL: Bu fonksiyon nutrition değerlerini AI'dan ALMAZ — yalnızca bir
 * KİMLİK (food_id) çözer. Nutrition, her zaman o food_id üzerinden ADIM 16
 * sözleşmesiyle ayrıca hesaplanır.
 *
 * Sıra: önce yerel veritabanı (hızlı, ağ gerektirmez, ADMIN/USDA ile
 * doğrulanmış). Yerelde eşleşme varsa USDA'ya HİÇ bakılmaz — yerel
 * veriler her zaman güvenilir şekilde önceliklendirilir. Yerelde
 * eşleşme yoksa KONTROLLÜ bir USDA fallback denenir (bkz. tryUsdaFallback).
 */
export async function matchLabelToFoods(
  label: string,
): Promise<FoodCandidateMatch[]> {
  const words = significantWords(label);
  if (words.length === 0) return [];

  const localMatches = await foodsRepository.searchByNameWords(words, 20);

  if (localMatches.length > 0) {
    const scored = localMatches
      .map((food) => {
        const nameLower = food.name.toLowerCase();
        const matchCount = words.filter((w) => nameLower.includes(w)).length;
        const score = matchCount / words.length;
        // "chicken" gibi bir kelimenin, aranan besinle İLGİSİZ bir yemeğin
        // (ör. "Fish, tuna salad" için "salad") yalnızca İKİNCİL bir
        // tanımlayıcı olarak geçmesi YA DA açıkça türetilmiş/işlenmiş bir
        // ürüne (ör. "Rice crackers") işaret etmesi — ikisi de "yerel =
        // her zaman güvenilir" varsayımını geçersiz kılar (bkz.
        // foodMatchScoring.ts'teki DÜRÜSTLÜK NOTU).
        const suspicious =
          isOffTypeMatch(label, food.name) || isSecondaryMentionOnly(label, food.name);
        return {
          food,
          score,
          suspicious,
          // Sıralama İÇİN kullanılır — raporlanan `match_score` alanı
          // DEĞİŞTİRİLMEZ, mevcut davranışın beklediği ham kelime-örtüşme
          // oranıdır.
          sortScore: suspicious ? score * 0.5 : score,
        };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.sortScore - a.sortScore)
      .slice(0, 5);

    const topScore = scored[0]?.score ?? 0;
    const secondScore = scored[1]?.score ?? 0;
    const isAmbiguous =
      scored.length > 1 && topScore - secondScore < MATCH_CONFIDENCE.AMBIGUITY_GAP;
    const isLowConfidence = topScore < MATCH_CONFIDENCE.LOCAL_LOW_CONFIDENCE;
    const listLevelConfirmation = isAmbiguous || isLowConfidence;

    const localRanked = scored.map((s) => ({
      match: {
        food_id: s.food.id,
        name: s.food.name,
        match_source: "LOCAL" as const,
        match_score: s.score,
        // "Yerel = her zaman güvenilir" varsayımı, yerel verinin KENDİSİ
        // daha önce hatalı bir otomatik eşleştirmeyle (ör. bu düzeltmeden
        // önce import edilmiş "Rice crackers") kirlenmişse geçersizdir —
        // bu yüzden her aday, listenin genel durumundan BAĞIMSIZ olarak
        // da ayrıca kontrolden geçirilir (bkz. `suspicious`, yukarıda).
        requires_user_confirmation: listLevelConfirmation || s.suspicious,
        has_verified_facts: true as const,
      } satisfies FoodCandidateMatch,
      sortScore: s.sortScore,
    }));

    if (scored.every((s) => s.suspicious)) {
      // Yerelde bulunan TEK seçenek(ler) şüpheli (muhtemelen daha önceki
      // hatalı bir eşleştirmeden kalma, tıpkı bu düzeltmeden önce import
      // edilmiş "Rice crackers"/"Fish, tuna salad" gibi) — kullanıcıya
      // GERÇEKTEN daha iyi bir alternatif sunabilmek için USDA'yı da dene
      // ve iki kaynağı, "şüpheli olmayan önce, sonra skora göre" birleştir.
      const usdaRanked = (await tryUsdaFallback(label)).map((match) => ({
        match,
        sortScore: match.match_score,
      }));
      return dedupeByFoodId(
        [...localRanked, ...usdaRanked].sort((a, b) => b.sortScore - a.sortScore),
      ).map((r) => r.match);
    }

    return localRanked.sort((a, b) => b.sortScore - a.sortScore).map((r) => r.match);
  }

  return tryUsdaFallback(label);
}
