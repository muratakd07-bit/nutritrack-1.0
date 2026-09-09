/**
 * FoodMatcher v2 (ADIM 29) — bir sorgu etiketini (AI'nin döndürdüğü serbest
 * metin besin ismi, ör. "cooked rice", "tavuk göğsü") bir aday food
 * açıklamasıyla (USDA `description` veya yerel `Food.name`) karşılaştırıp
 * [0, 1] aralığında bir GÜVEN SKORU üreten SAF, deterministik fonksiyonlar.
 *
 * v1 (ADIM 27/28), gerçek fotoğraf testlerinde bulunan İKİ somut hatayı
 * ("rice"→"Rice crackers", "salad"→"Fish, tuna salad") düzeltmek için
 * kelime örtüşmesi + USDA taksonomi formatı + küçük bir "işlenmiş ürün"
 * kelime listesine dayanıyordu. v2, ADIM 29'da GENİŞLETİLDİ:
 *  - Türkçe/İngilizce eş anlamlı kelime genişletmesi (yalnızca EŞLEŞTİRME
 *    için — bkz. domain/foods/README.md "Türkçe isimler": Food.name'in
 *    KENDİSİ hâlâ çevrilmez/görüntülenmez, bu yalnızca dahili bir arama
 *    yardımcısıdır).
 *  - Pişmiş/çiğ (cooked/raw) durumu: query VE description'ın İKİSİ de bir
 *    durum belirtiyorsa ve ÇELİŞİYORSA cezalandırılır.
 *  - Vücut parçası (breast/thigh/wing/...) çelişkisi: "chicken thigh"
 *    sorgusu yalnızca bir "chicken breast" kaydı bulursa, bu artık yüksek
 *    güvenle otomatik kabul edilmez.
 *  - Çeşit/renk (white/brown rice gibi) çelişkisi.
 *  - Kaba bir "besin kategorisi" sinyali (poultry/grain/dairy/fruit/
 *    vegetable/egg/seafood/dessert) — kategoriler uyuşursa bonus, KESİN
 *    olarak çelişirse ceza.
 *  - Türetilmiş/ikincil ürün cezası genişletildi: pie, frozen, substitute
 *    eklendi (kullanıcının açıkça istediği "frozen yogurt", "pie" gibi
 *    örnekleri hedefler).
 *  - Virgülsüz açıklamalarda da (ör. "Ham salad spread") "ana kelime İLK
 *    kelime midir" kontrolü — önceden yalnızca virgüllü USDA taksonomi
 *    formatında çalışıyordu.
 *
 * YALNIZCA `description`/`name` metnine dayanır — USDA'nın gerçekten
 * doğrulanmış tek alanı budur (bkz. domain/foods/usdaTypes.ts'teki
 * doğrulama notu; `foodCategory` gibi doğrulanmamış bir alana KASITLI
 * OLARAK güvenilmez — "kategori" burada METİNDEN çıkarılan bir SEZGİdir,
 * USDA'nın kendi resmi kategori alanı DEĞİLDİR).
 *
 * DÜRÜSTLÜK NOTU: Bu bir tam semantik sınıflandırıcı/NLP modeli DEĞİLDİR
 * — kelime örtüşmesi + birkaç elle derlenmiş sezgisel kural setidir.
 * Kusursuz değildir (ör. nadir/egzotik bir besinde kategori kelime
 * listesinde karşılığı olmayabilir — bu durumda kategori sinyali nötr
 * kalır, ceza YAZILMAZ). Gerçekte gözlemlenen hataları hedefler ve test
 * eder; iddiası budur, daha fazlası değil.
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
  "pie",
  "pies",
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
  "frozen",
  "substitute",
  "substitutes",
]);

/** Türkçe harfleri de (ayırıcı DEĞİL, kelime karakteri olarak) tanır. */
const TOKEN_SPLIT_REGEX = /[^a-z0-9çğıöşü]+/;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT_REGEX)
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
 * Türkçe/İngilizce (ve birkaç yaygın yazım varyantı) eş anlamlı kelime
 * grupları — YALNIZCA eşleştirme/arama için. Food.name'i ASLA değiştirmez
 * veya "çevrilmiş" bir isim üretmez (bkz. domain/foods/README.md).
 * Kapsam bilinçli olarak DAR tutuldu: yalnızca test edilmiş, gerçek
 * kullanım senaryolarını (ADIM 29'un belirttiği örnekler + en yaygın
 * temel besinler) kapsar — uydurma/genel bir çeviri motoru DEĞİLDİR.
 */
const SYNONYM_GROUPS: string[][] = [
  ["rice", "pirinç"],
  ["chicken", "tavuk"],
  ["egg", "eggs", "yumurta"],
  ["apple", "apples", "elma"],
  ["yogurt", "yoghurt", "yogurts", "yoğurt"],
  ["salad", "salata"],
  ["bread", "ekmek"],
  ["milk", "süt"],
  ["cheese", "peynir"],
  ["meat", "et"],
  ["fish", "balık"],
  ["potato", "potatoes", "patates"],
  ["tomato", "tomatoes", "domates"],
  ["onion", "onions", "soğan"],
  ["water", "su"],
  ["banana", "muz"],
  ["orange", "portakal"],
];

/**
 * Bir kelime listesini, eş anlamlı (TR/EN) tüm biçimleriyle genişletir —
 * yalnızca EŞLEŞTİRME/SIRALAMA için (bkz. dosya başı notu).
 */
export function expandWithSynonyms(words: string[]): string[] {
  const expanded = new Set(words);
  for (const word of words) {
    for (const group of SYNONYM_GROUPS) {
      if (group.includes(word)) {
        for (const synonym of group) expanded.add(synonym);
      }
    }
  }
  return Array.from(expanded);
}

function toCanonicalWord(word: string): string {
  for (const group of SYNONYM_GROUPS) {
    if (group.includes(word)) return group[0];
  }
  return word;
}

/**
 * Bir sorgu metnini, her kelimeyi (varsa) kendi KANONİK İngilizce eş
 * anlamlısıyla değiştirerek yeniden yazar — ör. "tavuk göğsü" → "chicken
 * göğüs" hâline gelmez, YALNIZCA gruptaki kelime tam eşleşirse değişir:
 * "tavuk" → "chicken" (grupta var), "göğsü" DEĞİŞMEZ (grupta tam olarak
 * "göğüs" var, "göğsü" çekimli hali farklı bir dize — bu KASITLI OLARAK
 * basit tutulmuştur, tam bir Türkçe morfolojik çözümleyici DEĞİLDİR).
 *
 * NEDEN VAR: Yerel DB araması ve USDA'nın kendi arama API'si YALNIZCA
 * İngilizce metin üzerinde çalışır (bkz. domain/foods/README.md "Türkçe
 * isimler" — Food.name asla çevrilmez). Sorgu tamamen ya da kısmen
 * Türkçe geldiğinde (ör. AI etiketleme davranışı ileride değişirse),
 * ARAMA/KEŞİF adımının kendisi bir sonuç bulabilmesi için İngilizce'ye
 * çevrilmiş bir sorgu metni GEREKİR — `expandWithSynonyms` yalnızca
 * SIRALAMA/PUANLAMA aşamasında (aday ZATEN elde edildikten SONRA)
 * yardımcı olur, aramanın KENDİSİNİ değiştirmez.
 */
export function toCanonicalQuery(text: string): string {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((rawWord) => toCanonicalWord(rawWord.toLowerCase()))
    .join(" ");
}

/**
 * Tek bir "grup" içindeki kelimelerin birbiriyle ÇELİŞTİĞİNİ (aynı
 * kategoriden AMA FARKLI bir değer) tespit eden genel amaçlı yardımcı —
 * pişmiş/çiğ, vücut parçası (göğüs/but/kanat), çeşit (beyaz/kahverengi)
 * gibi "ikisi de belirtilmişse ve FARKLIYSA ceza, aynıysa bonus" desenini
 * tekrar tekrar yazmamak için.
 */
function bucketAdjustment(
  queryWords: string[],
  descWords: string[],
  wordToBucket: Record<string, string>,
  matchBonus: number,
  conflictPenalty: number,
): number {
  const queryBucket = queryWords.map((w) => wordToBucket[w]).find(Boolean);
  const descBucket = descWords.map((w) => wordToBucket[w]).find(Boolean);
  if (!queryBucket || !descBucket) return 0;
  return queryBucket === descBucket ? matchBonus : conflictPenalty;
}

/** Pişmiş/çiğ durumu — yalnızca AÇIK, belirsiz olmayan kelimeler. */
const STATE_BUCKETS: Record<string, string> = {
  cooked: "cooked",
  boiled: "cooked",
  roasted: "cooked",
  steamed: "cooked",
  baked: "cooked",
  grilled: "cooked",
  braised: "cooked",
  fried: "cooked",
  toasted: "cooked",
  poached: "cooked",
  pişmiş: "cooked",
  haşlanmış: "cooked",
  raw: "raw",
  uncooked: "raw",
  fresh: "raw",
  çiğ: "raw",
};

/** Kanatlı eti vücut parçası — "chicken thigh" sorgusunun yalnızca bir
 * "chicken breast" kaydıyla otomatik/güvenli eşleşmesini engeller. */
const BODY_PART_BUCKETS: Record<string, string> = {
  breast: "breast",
  göğüs: "breast",
  thigh: "thigh",
  but: "thigh",
  wing: "wing",
  wings: "wing",
  kanat: "wing",
  leg: "leg",
  legs: "leg",
  drumstick: "drumstick",
  drumsticks: "drumstick",
  liver: "liver",
  heart: "heart",
  skin: "skin",
  gizzard: "gizzard",
};

/** Çeşit/renk — ör. "white rice" vs "brown rice". */
const VARIETY_BUCKETS: Record<string, string> = {
  white: "white",
  beyaz: "white",
  brown: "brown",
  kahverengi: "brown",
};

/**
 * Kaba, metinden çıkarılan bir "besin kategorisi" sinyali. USDA'nın
 * resmi/doğrulanmış bir kategori alanı DEĞİLDİR (bkz. dosya başı notu) —
 * yalnızca küçük, elle derlenmiş bir anahtar kelime kümesidir.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  poultry: ["chicken", "turkey", "duck", "tavuk"],
  grain: [
    "rice", "wheat", "oat", "oats", "barley", "pasta", "noodle", "noodles",
    "bread", "pirinç", "ekmek",
  ],
  dairy: ["milk", "cheese", "yogurt", "yoghurt", "cream", "süt", "peynir", "yoğurt"],
  fruit: ["apple", "apples", "banana", "orange", "berry", "berries", "grape", "grapes", "elma"],
  vegetable: [
    "carrot", "potato", "potatoes", "onion", "tomato", "lettuce", "spinach",
    "broccoli", "patates", "domates", "soğan",
  ],
  egg: ["egg", "eggs", "yumurta"],
  seafood: ["fish", "tuna", "salmon", "shrimp", "balık"],
  dessert: ["candy", "candies", "chocolate", "cake", "cakes", "pie", "pies", "cookie", "cookies"],
};

function inferCategory(words: string[]): string | null {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => keywords.includes(w))) return category;
  }
  return null;
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
 * Bir sorguda geçebilecek ama tek başına HİÇBİR besin-kimliği sinyali
 * TAŞIMAYAN kelimeler (bağlaçlar + genel pişirme/sunum ÜSLUBU kelimeleri).
 * Bunlar örtüşme oranının payda/paydasından TAMAMEN çıkarılır — ör.
 * "chicken stir fry" sorgusunda "stir"/"fry" kelimeleri USDA
 * açıklamalarında genelde HİÇ geçmez (USDA "fried"/"stir-fried" gibi
 * BİLEŞİK kelimeler kullanır), bu yüzden bunları payda'da tutmak
 * GERÇEK, iyi bir eşleşmeyi (ör. gerçek tavuk göğsü kaydı) yapay olarak
 * cezalandırırdı — bu, ADIM 27'nin canlı testinde kullanılan gerçek bir
 * AI etiketiyle (bkz. domain/foods/foodMatcher.test.ts) doğrulanmıştır.
 * NOT: `raw`/`cooked` gibi GERÇEK bir durum sinyali taşıyan kelimeler
 * buraya EKLENMEZ — onlar `STATE_BUCKETS` üzerinden ayrıca puanlanır.
 */
const SCORING_NOISE_WORDS = new Set([
  "a", "an", "the", "of", "with", "and",
  "stir", "fry", "style", "dish", "recipe", "homemade", "dinner", "meal", "plate",
]);

/**
 * `description`, `query`'nin temel besininden TÜRETİLMİŞ/İŞLENMİŞ farklı
 * bir ürün türü gibi görünüyorsa true döner (ör. query="rice",
 * description="Rice crackers" → true; ama query="salad",
 * description="Salad, ..., without dressing" → false, çünkü "dressing"
 * burada bir olumsuzlamanın parçasıdır).
 *
 * KRİTİK: Bu kontrol, hem USDA fallback adaylarına HEM DE zaten YEREL
 * veritabanında olan adaylara uygulanır (bkz. domain/foods/foodMatcher.ts)
 * — "yerel eşleşmeler her zaman güvenilirdir" varsayımı, yerel verinin
 * KENDİSİ daha önce hatalı bir otomatik eşleştirmeyle kirlenmişse
 * geçersizdir (ADIM 27/28'de gerçekten gözlemlendi).
 */
export function isOffTypeMatch(query: string, description: string): boolean {
  const queryWords = expandWithSynonyms(tokenize(query));
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
 * tuna salad" için "salad" — ana besin "fish/tuna"dır), bu true döner.
 *
 * VİRGÜLSÜZ açıklamalar için (ADIM 29'da eklendi — ör. "Ham salad
 * spread", "Tuna salad", "Potato salad with egg"): İLK KELİME, USDA'nın
 * virgüllü formatındaki "baş segment"in karşılığıdır. Sorgu kelimesi
 * ilk kelimeyle eşleşmiyorsa (ör. "salad" sorgusu için ilk kelime "ham"),
 * bu da ikincil/türetilmiş bir bahis olarak sayılır.
 */
export function isSecondaryMentionOnly(query: string, description: string): boolean {
  const queryWords = expandWithSynonyms(tokenize(query));
  const segments = description.split(",").map((s) => s.trim());

  if (segments.length > 1) {
    const headWords = tokenize(segments[0] ?? "");
    const queryIsHeadMatch = queryWords.some((w) => anyWordMatches(w, headWords));
    return !queryIsHeadMatch;
  }

  const descWords = tokenize(description);
  const firstWord = descWords[0];
  if (!firstWord) return false;
  return !queryWords.some((w) => wordsMatch(w, firstWord));
}

/**
 * Sorgu genel/düz bir besin adıysa (ör. "apple", "rice", "egg") ve
 * description'da bunun bir HAZIRLIK/İŞLENME durumunu (kurutulmuş, toz,
 * konserve, tütsülenmiş...) YA DA birden fazla malzemenin KARIŞIMI
 * olduğunu gösteren bir kelime varsa VE bu sorguda AÇIKÇA istenmediyse,
 * bu "GERÇEK aynı besin" (exact identity) DEĞİLDİR — ör. "Rice and
 * vermicelli mix" düz "rice" değildir, "Egg, white, dried" düz "egg"
 * değildir. `STATE_BUCKETS`'taki (pişmiş/çiğ) kelimelerden AYRIDIR —
 * onlar zaten çeliştiklerinde cezalandırılıyor; burdakiler sorgu
 * BUNLARDAN HİÇ BAHSETMEDİĞİNDE bile "bu tam olarak istediğin şey
 * değil, onaylar mısın?" sinyali verir.
 */
const IDENTITY_QUALIFIER_WORDS = new Set([
  "dried",
  "dry",
  "powder",
  "powdered",
  "canned",
  "smoked",
  "cured",
  "pickled",
  "concentrate",
  "concentrated",
  "mix",
  "mixed",
  "blend",
  "combination",
]);

function hasUnrequestedIdentityQualifier(query: string, description: string): boolean {
  const queryWords = expandWithSynonyms(tokenize(query));
  const descWords = tokenize(description);
  return descWords.some(
    (w) => IDENTITY_QUALIFIER_WORDS.has(w) && !anyWordMatches(w, queryWords),
  );
}

/**
 * Açıklamada, sorgu kelimesinin bir TİRE (hyphen) ile BAŞKA bir kelimeye
 * bağlı bileşik hâli varsa (ör. "Rose-apples" — bu GERÇEKTE bir elma
 * (Malus domestica) türü DEĞİLDİR, tamamen farklı bir tropikal meyvedir
 * ve yalnızca adında "apple" kelimesini İÇERİR), bu GERÇEK besin
 * kimliğinin sorgudan FARKLI olabileceğinin güçlü, deterministik bir
 * işaretidir — kelime örtüşmesi (`wordsMatch`'in tekil/çoğul toleransı)
 * tek başına bunu YAKALAYAMAZ.
 */
function hasHyphenatedCompoundVariant(query: string, description: string): boolean {
  const queryWords = expandWithSynonyms(tokenize(query));
  const lowerDescription = description.toLowerCase();
  return queryWords.some((word) => {
    if (word.length < 4) return false; // kısa kelimelerde yanlış pozitif riski
    return new RegExp(`-${word}s?\\b`).test(lowerDescription);
  });
}

/**
 * "Exact food identity" kontrolü (ADIM 29 düzeltmesi). Yalnızca kelime
 * örtüşmesine değil, hazırlık/işlenme durumuna, kompozisyona (tek
 * malzeme mi karışım mı) ve isim-bazlı çeşit farkına bakar. true
 * dönerse, aday OTOMATİK/güvenilir kabul EDİLMEMELİDİR — kullanıcı
 * onayı gerekir (bkz. domain/foods/foodMatcher.ts → `suspicious`).
 *
 * Örnekler: rice→"Rice and vermicelli mix" (mix), apple→"Apples, dried"
 * (dried), apple→"Rose-apples" (bileşik tür adı), egg→"Egg, white,
 * dried" (dried).
 */
export function hasExactIdentityMismatch(query: string, description: string): boolean {
  return (
    hasUnrequestedIdentityQualifier(query, description) ||
    hasHyphenatedCompoundVariant(query, description)
  );
}

/**
 * `query` (AI'nin döndürdüğü etiket) ile `description`/`name` (USDA veya
 * yerel bir adayın metni) arasında [0, 1] aralığında bir güven skoru
 * üretir. Daha yüksek = daha güvenilir eşleşme. Hem USDA fallback
 * adayları HEM DE yerel DB adayları için AYNI fonksiyon kullanılır (v1'de
 * ikisi ayrı, tutarsız formüllere sahipti — bkz. domain/foods/foodMatcher.ts).
 */
export function scoreFoodCandidate(query: string, description: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedDescription = description.trim().toLowerCase();
  if (normalizedQuery.length > 0 && normalizedQuery === normalizedDescription) {
    return 1;
  }

  const queryWordsRaw = tokenize(query);
  const descWords = tokenize(description);
  if (queryWordsRaw.length === 0 || descWords.length === 0) return 0;

  // Örtüşme oranı, besin KİMLİĞİ taşımayan kelimeler (bağlaçlar, "stir",
  // "fry" gibi genel pişirme üslubu ifadeleri) hariç tutularak hesaplanır
  // — bkz. SCORING_NOISE_WORDS. Sorgu YALNIZCA gürültü kelimelerinden
  // oluşuyorsa (nadir), orijinal listeye geri dönülür.
  const scorableWordsRaw = queryWordsRaw.filter((w) => !SCORING_NOISE_WORDS.has(w));
  const denominatorWords = scorableWordsRaw.length > 0 ? scorableWordsRaw : queryWordsRaw;
  const queryWords = expandWithSynonyms(denominatorWords);

  const overlapCount = queryWords.filter((w) => anyWordMatches(w, descWords)).length;
  if (overlapCount === 0) return 0;

  let score = Math.min(1, overlapCount / denominatorWords.length);

  const segments = description.split(",").map((s) => s.trim());
  const hasCommaFormat = segments.length > 1;

  if (isSecondaryMentionOnly(query, description)) {
    score -= 0.25;
  } else if (hasCommaFormat) {
    score += 0.3;
  }

  if (!hasCommaFormat) {
    // Virgülsüz, bileşik-isim tarzı açıklamalar ("Rice crackers", "Potato
    // chips") USDA'nın temel-besin taksonomi formatında DEĞİLDİR — genelde
    // işlenmiş/markalı bir üründür.
    score -= 0.15;
  }

  if (isOffTypeMatch(query, description)) {
    // ADIM 29'da 0.5'ten 0.6'ya çıkarıldı: gerçek yerel veriyle test
    // edilirken "Salad dressing, coleslaw" (baş segment eşleşmesi
    // BONUSU + off-type CEZASI ile) hâlâ gerçek salata seçeneklerinden
    // ("Fish, tuna salad", "McDONALD'S, Side Salad") daha yüksek puan
    // alıyordu — bu, tam olarak önlemeye çalıştığımız türden bir hataydı.
    score -= 0.6;
  }

  score += bucketAdjustment(queryWords, descWords, STATE_BUCKETS, 0.15, -0.35);
  score += bucketAdjustment(queryWords, descWords, BODY_PART_BUCKETS, 0.15, -0.4);
  score += bucketAdjustment(queryWords, descWords, VARIETY_BUCKETS, 0.1, -0.3);

  const queryCategory = inferCategory(queryWords);
  const descCategory = inferCategory(descWords);
  if (queryCategory && descCategory) {
    score += queryCategory === descCategory ? 0.1 : -0.3;
  }

  return Math.max(0, Math.min(1, score));
}

/** Geriye dönük uyumluluk için — v1'in adı. Aynı fonksiyon. */
export const scoreUsdaCandidate = scoreFoodCandidate;

/** Bir aday listesinin "otomatik kabul edilecek kadar güvenilir" olup olmadığını belirleyen eşikler. */
export const MATCH_CONFIDENCE = {
  /** Bu skorun altındaki bir USDA adayı hiç sunulmaz (alaka düzeyi çok düşük). */
  USDA_MIN_SCORE_TO_SHOW: 0.2,
  /** İki adayın skoru arasındaki fark bu değerin altındaysa "belirsiz" kabul edilir. */
  AMBIGUITY_GAP: 0.15,
  /**
   * Bir adayın skoru bu eşiğin ALTINDAYSA (kaynağı ne olursa olsun)
   * `requires_user_confirmation=true` olur. v1'de yerel/USDA için ayrı
   * ("LOCAL_LOW_CONFIDENCE") bir eşik vardı — v2 puanlama artık tek/tutarlı
   * olduğu için eşik de tek.
   */
  CONFIRMATION_SCORE_THRESHOLD: 0.75,
} as const;
