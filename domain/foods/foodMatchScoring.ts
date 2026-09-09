/**
 * USDA arama sonuçlarını, bir sorgu etiketine (AI'nin döndürdüğü serbest
 * metin besin ismi) göre GERÇEK bir eşleşme olasılığına göre puanlayan
 * SAF, deterministik bir fonksiyon.
 *
 * NEDEN VAR: ADIM 27'nin gerçek fotoğraf testinde canlı olarak gözlemlenen
 * gerçek bir ürün doğruluğu hatası — "rice" etiketi USDA aramasının İLK
 * sonucu olan "Rice crackers"e, "salad" etiketi "Fish, tuna salad"e
 * otomatik eşleşti. Kök neden: eski kod, USDA arama sonucunun sırasını
 * (ilk = en iyi) sorgusuz kabul ediyordu. Bu dosya, description metnine
 * dayalı ek bir sıralama katmanı ekler.
 *
 * YALNIZCA `description` alanına dayanır — bu, USDA `/foods/search`
 * yanıtında GERÇEKTEN doğrulanmış TEK metinsel alandır (bkz.
 * domain/foods/usdaTypes.ts'teki doğrulama notu; `foodCategory` gibi
 * doğrulanmamış bir alana KASITLI OLARAK güvenilmez).
 *
 * DÜRÜSTLÜK NOTU: Bu bir tam semantik sınıflandırıcı DEĞİLDİR — kelime
 * örtüşmesi + USDA'nın SR Legacy/Foundation taksonomi biçimi (virgülle
 * ayrılmış "Ana besin, tanımlayıcı, tanımlayıcı" formatı) + küçük, elle
 * derlenmiş bir "işlenmiş/türetilmiş ürün" kelime listesine dayanan bir
 * SEZGİSEL (heuristic) puanlamadır. Kusursuz değildir (ör. gerçekten
 * "salata sosu" arayan bir sorguyu de cezalandırabilir) — ama gerçekte
 * gözlemlenen iki hatayı (rice→crackers, salad→tuna salad) doğrudan
 * düzeltecek şekilde tasarlanmış ve test edilmiştir.
 */

/**
 * Bir tanımlayıcı kelime bir sorguda YOKSA ve açıklamada VARSA, bu genelde
 * temel besinin kendisi değil, ondan türetilmiş/işlenmiş bir ürün olduğunu
 * gösterir (ör. "rice" sorgusu için "cracker" kelimesi).
 */
export const OFF_TYPE_MODIFIERS = new Set([
  "cracker",
  "crackers",
  "cookie",
  "cookies",
  "cake",
  "cakes",
  "chip",
  "chips",
  "candy",
  "candies",
  "cereal",
  "bar",
  "bars",
  "snack",
  "snacks",
  "wafer",
  "wafers",
  "syrup",
  "juice",
  "drink",
  "beverage",
  "beverages",
  "dressing",
  "sauce",
  "soup",
  "pudding",
  "flavored",
  "extract",
  "wine",
  "chow",
  "flour",
  "noodle",
  "noodles",
  "pasta",
  "bread",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

/**
 * İki kelimenin "aynı kavram" olup olmadığını kabaca belirler — tam bir
 * dilbilimsel kök bulucu (stemmer) DEĞİLDİR, ama "potato"/"potatoes",
 * "cracker"/"crackers" gibi yalın tekil/çoğul farklarını tolere eder.
 * Kısa kelimelerde (< 4 harf) yanlış pozitifi önlemek için yalnızca TAM
 * eşleşmeye izin verir.
 */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

function anyWordMatches(word: string, candidates: string[]): boolean {
  return candidates.some((c) => wordsMatch(word, c));
}

/**
 * Bir "off-type" kelimenin hemen önünde bu kelimelerden biri varsa, o
 * kelime bir YOKLUK/olumsuzlama ifade eder (ör. "without dressing" —
 * bu, tanımlanan şeyin bir salata sosu ÜRÜNÜ olduğu anlamına gelmez,
 * tam tersine sosSUZ bir salatayı tanımlar). Böyle durumlarda
 * `isOffTypeMatch` o kelimeyi cezalandırmamalıdır.
 */
const NEGATION_WORDS = new Set(["without", "no", "non", "unsweetened", "sans"]);

/**
 * `description`, `query`'nin temel besininden TÜRETİLMİŞ/İŞLENMİŞ farklı
 * bir ürün türü gibi görünüyorsa true döner (ör. query="rice",
 * description="Rice crackers" → true; ama query="salad",
 * description="Salad, ..., without dressing" → false, çünkü "dressing"
 * burada bir olumsuzlamanın parçasıdır).
 *
 * KRİTİK: Bu kontrol, hem USDA fallback adaylarına (bkz.
 * `scoreUsdaCandidate`, aşağıda) HEM DE zaten YEREL veritabanında olan
 * adaylara (bkz. domain/foods/foodMatcher.ts → `matchLabelToFoods`)
 * uygulanır. Neden: ADIM 27'nin canlı testinde, bu düzeltmeden ÖNCE
 * hatalı eşleşen "Rice crackers"/"Fish, tuna salad" kayıtları BİR KEZ
 * gerçek veritabanına import edildikten sonra, "yerel eşleşmeler her
 * zaman güvenilirdir" kuralı onları GELECEKTEKİ aramalarda da
 * (USDA'ya hiç gitmeden) otomatik/onaysız olarak öne çıkarmaya devam
 * ederdi — bu fonksiyon olmadan, hata veriye KALICI OLARAK gömülmüş
 * olurdu.
 */
export function isOffTypeMatch(query: string, description: string): boolean {
  const queryWords = tokenize(query);
  const descWords = tokenize(description);
  for (let i = 0; i < descWords.length; i++) {
    const w = descWords[i];
    if (!OFF_TYPE_MODIFIERS.has(w)) continue;
    if (anyWordMatches(w, queryWords)) continue;
    const prevWord = descWords[i - 1];
    if (prevWord && NEGATION_WORDS.has(prevWord)) continue;
    return true;
  }
  return false;
}

/**
 * USDA açıklamaları taksonomik olarak "Ana besin, tanımlayıcı,
 * tanımlayıcı" şeklinde virgülle ayrılır (ör. "Rice, white, cooked").
 * Sorgu kelimesi yalnızca İKİNCİL bir segmentte geçiyorsa (ör. "Fish,
 * tuna salad" için "salad" — ana besin "fish/tuna"dır), bu true döner:
 * aranan şey açıklamanın ANA konusu DEĞİLDİR, yalnızca bir hazırlama
 * stili/yan tanımlayıcı olarak geçmektedir.
 */
export function isSecondaryMentionOnly(query: string, description: string): boolean {
  const segments = description.split(",").map((s) => s.trim());
  if (segments.length <= 1) return false; // virgülsüzse "ana segment" kavramı uygulanmaz

  const queryWords = tokenize(query);
  const headWords = tokenize(segments[0] ?? "");
  const queryIsHeadMatch = queryWords.some((w) => anyWordMatches(w, headWords));
  return !queryIsHeadMatch;
}

/**
 * `query` (AI'nin döndürdüğü etiket) ile `description` (USDA arama
 * sonucunun metni) arasında [0, 1] aralığında bir eşleşme skoru üretir.
 * Daha yüksek = daha güvenilir eşleşme.
 */
export function scoreUsdaCandidate(query: string, description: string): number {
  const queryWords = tokenize(query);
  const descWords = tokenize(description);
  if (queryWords.length === 0 || descWords.length === 0) return 0;

  const overlapCount = queryWords.filter((w) => anyWordMatches(w, descWords)).length;
  if (overlapCount === 0) return 0;

  let score = overlapCount / queryWords.length;

  const segments = description.split(",");
  if (isSecondaryMentionOnly(query, description)) {
    score -= 0.25;
  } else if (segments.length > 1) {
    score += 0.3;
  }

  if (segments.length <= 1) {
    // Virgülsüz, bileşik-isim tarzı açıklamalar ("Rice crackers", "Potato
    // chips") USDA'nın temel-besin taksonomi formatında DEĞİLDİR — genelde
    // işlenmiş/markalı bir üründür.
    score -= 0.15;
  }

  if (isOffTypeMatch(query, description)) {
    score -= 0.5;
  }

  return Math.max(0, Math.min(1, score));
}

/** Bir aday listesinin "otomatik kabul edilecek kadar güvenilir" olup olmadığını belirleyen eşikler. */
export const MATCH_CONFIDENCE = {
  /** Bu skorun altındaki bir USDA adayı hiç sunulmaz (alaka düzeyi çok düşük). */
  USDA_MIN_SCORE_TO_SHOW: 0.2,
  /** Yerel bir eşleşme bu skorun altındaysa kullanıcı onayı gerektirir. */
  LOCAL_LOW_CONFIDENCE: 0.5,
  /** İki adayın skoru arasındaki fark bu değerin altındaysa "belirsiz" kabul edilir. */
  AMBIGUITY_GAP: 0.15,
} as const;
