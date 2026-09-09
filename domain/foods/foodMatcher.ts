import { foodsRepository } from "./repository";
import { searchUsdaFoods, getUsdaFoodsByIds, UsdaApiError } from "./usdaClient";
import { importUsdaFoods, USDA_SOURCE } from "./importUsdaFoods";
import {
  scoreFoodCandidate,
  isOffTypeMatch,
  isSecondaryMentionOnly,
  expandWithSynonyms,
  toCanonicalQuery,
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
    // USDA'nın kendi arama API'si YALNIZCA İngilizce metin üzerinde
    // çalışır (bkz. foodMatchScoring.ts → toCanonicalQuery) — `label`
    // Türkçe kelimeler içeriyorsa (ör. "tavuk"), aramanın KENDİSİ hiçbir
    // sonuç bulamaz; puanlama/sıralama (aşağıda, scoreFoodCandidate) aday
    // ZATEN elde edildikten SONRA çalışır, aramanın yerine geçmez.
    const searchQuery = toCanonicalQuery(label);
    const results = await searchUsdaFoods(
      searchQuery,
      ["Foundation", "SR Legacy"],
      USDA_SEARCH_POOL_SIZE,
    );
    if (results.length === 0) return [];

    const scored = results
      .map((r) => ({ ...r, score: scoreFoodCandidate(label, r.description) }))
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

  // Türkçe bir kelime (ör. "tavuk") geldiğinde, yerel DB'deki İngilizce
  // isimlerde ("Chicken, ...") bulunabilmesi için eş anlamlılarıyla
  // (bkz. foodMatchScoring.ts) genişletilir — `words`'ün KENDİSİ
  // (genişletilmemiş hâli) hâlâ puanlama/loglama için ayrıca tutulur.
  const searchWords = expandWithSynonyms(words);
  const localMatches = await foodsRepository.searchByNameWords(searchWords, 20);

  if (localMatches.length > 0) {
    const scored = localMatches
      .map((food) => {
        // v2 (ADIM 29): yerel adaylar da USDA adaylarıyla AYNI birleşik
        // puanlayıcıyla (bkz. foodMatchScoring.ts) değerlendirilir — v1'de
        // yerel puanlama (ham kelime-örtüşme oranı) ile USDA puanlaması
        // ayrı, tutarsız formüllerdi. Aynı fonksiyon; pişmiş/çiğ, vücut
        // parçası, çeşit ve kategori çelişkilerini de artık hesaba katar.
        const score = scoreFoodCandidate(label, food.name);
        // "chicken" gibi bir kelimenin, aranan besinle İLGİSİZ bir yemeğin
        // (ör. "Fish, tuna salad" için "salad") yalnızca İKİNCİL bir
        // tanımlayıcı olarak geçmesi YA DA açıkça türetilmiş/işlenmiş bir
        // ürüne (ör. "Rice crackers") işaret etmesi — ikisi de "yerel =
        // her zaman güvenilir" varsayımını geçersiz kılar (bkz.
        // foodMatchScoring.ts'teki DÜRÜSTLÜK NOTU).
        const suspicious =
          isOffTypeMatch(label, food.name) || isSecondaryMentionOnly(label, food.name);
        return { food, score, suspicious };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const topScore = scored[0]?.score ?? 0;
    const secondScore = scored[1]?.score ?? 0;
    const isAmbiguous =
      scored.length > 1 && topScore - secondScore < MATCH_CONFIDENCE.AMBIGUITY_GAP;

    // Bir aday, TEK BAŞINA (rakipsiz) net bir şekilde güvenilir/otomatik
    // sayılır ancak VE ANCAK: şüpheli İŞARETLENMEMİŞ VE skoru eşiğin
    // üzerindeyse. Belirsizlik (isAmbiguous) BUNDAN AYRI bir kavramdır:
    // birden fazla GERÇEKTEN iyi/şüpheli-olmayan yerel aday varsa, USDA'ya
    // hiç gitmeye gerek YOKTUR — kullanıcı zaten iyi seçenekler arasından
    // seçer. USDA'ya yalnızca hiçbir iyi/şüpheli-olmayan aday YOKSA bakılır.
    const isGoodCandidate = (s: (typeof scored)[number]) =>
      !s.suspicious && s.score >= MATCH_CONFIDENCE.CONFIRMATION_SCORE_THRESHOLD;

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
        // Belirsizlik (isAmbiguous) VEYA düşük skor VEYA şüpheli olmak,
        // HER BİRİ TEK BAŞINA onay gerektirir.
        requires_user_confirmation: isAmbiguous || !isGoodCandidate(s),
        has_verified_facts: true as const,
      } satisfies FoodCandidateMatch,
      sortScore: s.score,
    }));

    if (!scored.some(isGoodCandidate)) {
      // Yerelde GERÇEKTEN iyi/şüpheli-olmayan hiçbir aday yoksa (hepsi
      // şüpheli veya düşük skorlu — muhtemelen daha önceki hatalı bir
      // eşleştirmeden kalma, tıpkı bu düzeltmeden önce import edilmiş
      // "Rice crackers"/"Fish, tuna salad" gibi) — kullanıcıya GERÇEKTEN
      // daha iyi bir alternatif sunabilmek için USDA'yı da dene ve iki
      // kaynağı skora göre birleştir.
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
