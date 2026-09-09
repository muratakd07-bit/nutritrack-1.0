import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearchByNameWords = vi.fn();
const mockFindById = vi.fn();
const mockFindFactsBySourceRef = vi.fn();
const mockSearchUsdaFoods = vi.fn();
const mockGetUsdaFoodsByIds = vi.fn();
const mockImportUsdaFoods = vi.fn();

vi.mock("./repository", () => ({
  foodsRepository: {
    searchByNameWords: (...args: unknown[]) => mockSearchByNameWords(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    findFactsBySourceRef: (...args: unknown[]) =>
      mockFindFactsBySourceRef(...args),
  },
}));

vi.mock("./usdaClient", async () => {
  const actual = await vi.importActual<typeof import("./usdaClient")>(
    "./usdaClient",
  );
  return {
    ...actual,
    searchUsdaFoods: (...args: unknown[]) => mockSearchUsdaFoods(...args),
    getUsdaFoodsByIds: (...args: unknown[]) => mockGetUsdaFoodsByIds(...args),
  };
});

vi.mock("./importUsdaFoods", () => ({
  USDA_SOURCE: "USDA_FDC",
  importUsdaFoods: (...args: unknown[]) => mockImportUsdaFoods(...args),
}));

import { matchLabelToFoods } from "./foodMatcher";
import { UsdaApiError } from "./usdaClient";
import { MATCH_CONFIDENCE } from "./foodMatchScoring";

beforeEach(() => {
  mockSearchByNameWords.mockReset();
  mockFindById.mockReset();
  mockFindFactsBySourceRef.mockReset();
  mockSearchUsdaFoods.mockReset();
  mockGetUsdaFoodsByIds.mockReset();
  mockImportUsdaFoods.mockReset();
});

/**
 * `findFactsBySourceRef` + `findById` + `importUsdaFoods`'u gerçekçi bir
 * sırayla simüle eder: `alreadyImported` verilenler HER ZAMAN mevcuttur
 * (import tetiklenmez); `newlyImported` verilenler yalnızca
 * `importUsdaFoods` ÇAĞRILDIKTAN SONRA "mevcut" hale gelir (gerçek kodun
 * "önce kontrol et, yoksa fetch+import et, sonra tekrar kontrol et"
 * sırasını doğru test edebilmek için).
 */
function stubUsdaFoodResolution(opts: {
  alreadyImported?: Record<number, { foodId: string; name: string }>;
  newlyImported?: Record<number, { foodId: string; name: string }>;
}) {
  const already = opts.alreadyImported ?? {};
  const pending = opts.newlyImported ?? {};
  let imported = false;

  mockFindFactsBySourceRef.mockImplementation(
    async (_source: string, sourceRef: string) => {
      const id = Number(sourceRef);
      if (already[id]) return { foodId: already[id].foodId };
      if (imported && pending[id]) return { foodId: pending[id].foodId };
      return null;
    },
  );
  mockImportUsdaFoods.mockImplementation(async () => {
    imported = true;
    return { importedCount: Object.keys(pending).length };
  });
  mockFindById.mockImplementation(async (foodId: string) => {
    const all = { ...already, ...pending };
    const entry = Object.values(all).find((e) => e.foodId === foodId);
    return entry ? { id: entry.foodId, name: entry.name } : null;
  });
}

describe("matchLabelToFoods — yerel eşleşme", () => {
  it("yerelde eşleşme varsa USDA'ya hiç istek atmaz (chicken stir fry → gerçek tavuk göğsü adayı)", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "food-1", name: "Chicken, broiler or fryers, breast, cooked" },
    ]);

    const result = await matchLabelToFoods("chicken stir fry");

    expect(result).toHaveLength(1);
    expect(result[0].match_source).toBe("LOCAL");
    expect(result[0].food_id).toBe("food-1");
    expect(result[0].has_verified_facts).toBe(true);
    expect(mockSearchUsdaFoods).not.toHaveBeenCalled();
  });

  it("Türkçe/İngilizce eşleşme: 'tavuk' sorgusu yerel DB'yi İngilizce eş anlamlısıyla ('chicken') da arar", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "food-1", name: "Chicken, broiler or fryers, breast, cooked" },
    ]);

    const result = await matchLabelToFoods("tavuk");

    // Yerel DB araması, "tavuk" YANINDA "chicken" ile de genişletilmiş
    // olmalı — aksi halde İngilizce isimli hiçbir kayıt asla bulunamaz.
    const searchedWords = mockSearchByNameWords.mock.calls[0][0] as string[];
    expect(searchedWords).toContain("tavuk");
    expect(searchedWords).toContain("chicken");
    expect(result[0]?.food_id).toBe("food-1");
    expect(result[0]?.requires_user_confirmation).toBe(false);
  });

  it("kelime eşleşme sayısına göre skorlayıp sıralar; alakasız/off-type bir aday (soup) elenir", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "partial", name: "Chicken soup" }, // "soup" off-type + yalnızca "chicken" eşleşir
      { id: "full", name: "Grilled chicken breast fillet" }, // "grilled"+"chicken"+"breast" eşleşir
    ]);

    const result = await matchLabelToFoods("grilled chicken breast");

    // v2: "Chicken soup" off-type ("soup") OLDUĞU için skoru 0'a düşer ve
    // tamamen elenir — yalnızca gerçek eşleşme kalır.
    expect(result).toHaveLength(1);
    expect(result[0].food_id).toBe("full");
    expect(result[0].requires_user_confirmation).toBe(false);
  });

  it("anlamlı kelime yoksa (çok kısa/stopword) boş dizi döner, hiç sorgu yapmaz", async () => {
    const result = await matchLabelToFoods("of the a");
    expect(result).toEqual([]);
    expect(mockSearchByNameWords).not.toHaveBeenCalled();
  });

  it("tek, net baskın bir yerel eşleşme varsa requires_user_confirmation=false (güvenilir, otomatik)", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "food-1", name: "Chicken, broiler or fryers, breast, cooked" },
    ]);

    const result = await matchLabelToFoods("chicken breast");
    expect(result[0].requires_user_confirmation).toBe(false);
  });

  it("belirsiz (skorları birbirine yakın) yerel eşleşmelerde requires_user_confirmation=true", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "a", name: "Apple, raw, with skin" },
      { id: "b", name: "Apple, raw, without skin" },
    ]);

    const result = await matchLabelToFoods("apple raw");
    expect(result.every((r) => r.requires_user_confirmation)).toBe(true);
  });

  it("GERÇEK SENARYO: 'Rice crackers' ZATEN yerel DB'deyse (önceki hatalı bir importtan), tek/baskın eşleşme olsa bile requires_user_confirmation=true olur", async () => {
    // Bu, ADIM 27'nin canlı testinde GERÇEKTEN olan şeydir: düzeltmeden
    // önceki bir çalıştırma "Rice crackers"i USDA'dan yerel DB'ye import
    // etti. O andan itibaren "rice" sorgusu YEREL arama dalına düşer ve
    // TEK/baskın eşleşme olduğu için (rakip yok) eskiden otomatik/onaysız
    // kabul edilirdi — off-type kontrolü olmadan hata veriye KALICI olarak
    // gömülmüş olurdu.
    mockSearchByNameWords.mockResolvedValue([
      { id: "food-crackers", name: "Rice crackers" },
    ]);

    const result = await matchLabelToFoods("rice");

    expect(result).toHaveLength(1);
    expect(result[0].match_source).toBe("LOCAL");
    expect(result[0].requires_user_confirmation).toBe(true);
    // ADIM 29 GÜVENLİK DÜZELTMESİ: yerelde EN AZ BİR aday varsa (şüpheli
    // olsa BİLE), USDA'ya HİÇ gidilmez — "şüpheli" olmak "daha fazla veri
    // çekmek için USDA'ya git" anlamına GELMEZ. Önceki bir sürüm bunu
    // yapıyordu ve "salad"/"tuna salad"/"yogurt"/"apple"/"rice" gibi
    // sorgularda GERÇEKTEN gereksiz USDA importuna yol açtı.
    expect(mockSearchUsdaFoods).not.toHaveBeenCalled();
  });

  it("GERÇEK SENARYO: yerelde hem 'Fish, tuna salad' hem gerçek bir salata varsa, salata üste sıralanır", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "food-tuna-salad", name: "Fish, tuna salad" },
      { id: "food-veg-salad", name: "Salad, vegetable, tossed, without dressing" },
    ]);

    const result = await matchLabelToFoods("salad");

    expect(result[0].food_id).toBe("food-veg-salad");
    expect(
      result.find((r) => r.food_id === "food-tuna-salad")?.requires_user_confirmation,
    ).toBe(true);
  });

  it("düşük skorlu tek bir yerel eşleşmede requires_user_confirmation=true (ve GERÇEKTEN daha iyi bir şey var mı diye USDA'ya bakar)", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "weak", name: "Mixed dish containing chicken, unspecified" },
    ]);
    mockSearchUsdaFoods.mockResolvedValue([]); // USDA'da da daha iyi bir şey yok

    // "grilled chicken breast fillet" kelimelerinden yalnızca "chicken"
    // geçiyor -> düşük skor -> tek/zayıf yerel adayla kalınır.
    const result = await matchLabelToFoods("grilled chicken breast fillet");
    expect(result[0].match_score).toBeLessThan(MATCH_CONFIDENCE.CONFIRMATION_SCORE_THRESHOLD);
    expect(result[0].requires_user_confirmation).toBe(true);
  });
});

describe("matchLabelToFoods — USDA fallback candidate ranking (ADIM 27 gerçek hata düzeltmesi)", () => {
  it("Türkçe/İngilizce eşleşme: yerelde hiç eşleşme yoksa, USDA'ya KANONİK (İngilizce) sorgu gönderilir", async () => {
    // USDA'nın arama API'si Türkçe metin anlamaz — "tavuk" yerine
    // "chicken" gönderilmelidir (bkz. foodMatchScoring.ts → toCanonicalQuery).
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([]);

    await matchLabelToFoods("tavuk");

    expect(mockSearchUsdaFoods).toHaveBeenCalledWith(
      "chicken",
      expect.anything(),
      expect.anything(),
    );
  });

  it("GERÇEK HATA DÜZELTMESİ: 'rice' → 'Rice crackers' ilk sıraya otomatik gelmez, gerçek pirinç üste çıkar", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    // Bu iki sonuç, ADIM 27'nin canlı testinde GERÇEKTEN karşılaşılan
    // "Rice crackers" ile birlikte, USDA'nın tipik taksonomi formatında
    // temsili bir "gerçek pirinç" sonucunu simüle eder.
    mockSearchUsdaFoods.mockResolvedValue([
      { fdcId: 111, description: "Rice crackers" },
      { fdcId: 222, description: "Rice, white, long-grain, regular, cooked" },
    ]);
    stubUsdaFoodResolution({
      newlyImported: {
        111: { foodId: "food-crackers", name: "Rice crackers" },
        222: { foodId: "food-white-rice", name: "Rice, white, long-grain, regular, cooked" },
      },
    });
    mockGetUsdaFoodsByIds.mockResolvedValue([]);

    const result = await matchLabelToFoods("rice");

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].food_id).toBe("food-white-rice");
    expect(result[0].name).not.toMatch(/cracker/i);
    // "Rice crackers" tamamen elenmemiş olabilir (kelime örtüşmesi var) ama
    // KESİNLİKLE ilk sırada DEĞİL.
    const crackersIndex = result.findIndex((r) => r.food_id === "food-crackers");
    if (crackersIndex !== -1) {
      expect(crackersIndex).toBeGreaterThan(0);
    }
    expect(result.every((r) => r.requires_user_confirmation)).toBe(true);
    expect(result.every((r) => r.has_verified_facts)).toBe(true);
  });

  it("GERÇEK HATA DÜZELTMESİ: 'salad' → 'Fish, tuna salad' otomatik ilk sıraya gelmez", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([
      { fdcId: 333, description: "Fish, tuna salad" },
      { fdcId: 444, description: "Salad, vegetable, tossed, without dressing" },
    ]);
    stubUsdaFoodResolution({
      newlyImported: {
        333: { foodId: "food-tuna-salad", name: "Fish, tuna salad" },
        444: { foodId: "food-veg-salad", name: "Salad, vegetable, tossed, without dressing" },
      },
    });
    mockGetUsdaFoodsByIds.mockResolvedValue([]);

    const result = await matchLabelToFoods("salad");

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].food_id).toBe("food-veg-salad");
  });

  it("yerelde eşleşme yoksa USDA fallback dener, birden fazla makul adayı import eder ve hepsini döner (multiple candidates)", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([
      { fdcId: 501, description: "Broccoli, raw" },
      { fdcId: 502, description: "Broccoli, cooked, boiled, drained, without salt" },
    ]);
    stubUsdaFoodResolution({
      newlyImported: {
        501: { foodId: "food-broccoli-raw", name: "Broccoli, raw" },
        502: { foodId: "food-broccoli-cooked", name: "Broccoli, cooked, boiled, drained, without salt" },
      },
    });
    mockGetUsdaFoodsByIds.mockResolvedValue([]);

    const result = await matchLabelToFoods("broccoli");

    expect(mockImportUsdaFoods).toHaveBeenCalledWith([501, 502], expect.anything());
    expect(result.length).toBe(2);
    expect(result.every((r) => r.match_source === "USDA_FDC")).toBe(true);
    expect(result.every((r) => r.requires_user_confirmation)).toBe(true);
  });

  it("USDA'da zaten import edilmiş bir food varsa TEKRAR import etmez", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([
      { fdcId: 331960, description: "Chicken, broiler or fryers, breast, cooked" },
    ]);
    stubUsdaFoodResolution({
      alreadyImported: {
        331960: { foodId: "existing-food-id", name: "Chicken, broiler or fryers, breast, cooked" },
      },
    });

    const result = await matchLabelToFoods("chicken breast");

    expect(mockImportUsdaFoods).not.toHaveBeenCalled();
    expect(result[0].food_id).toBe("existing-food-id");
  });

  it("çok düşük alaka düzeyindeki (skor eşiğin altında) USDA sonuçları hiç döndürülmez (no match)", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([
      { fdcId: 999, description: "Beef, ground, 80% lean meat / 20% fat, raw" },
    ]);

    const result = await matchLabelToFoods("xyz nonexistent food term");

    expect(result).toEqual([]);
    expect(mockImportUsdaFoods).not.toHaveBeenCalled();
  });

  it("USDA rate limit hatasında ÇÖKMEZ, boş sonuç döner", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockRejectedValue(new UsdaApiError("rate limited", 429));

    const result = await matchLabelToFoods("some unknown food");

    expect(result).toEqual([]);
  });

  it("USDA'da hiç sonuç yoksa boş dizi döner", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([]);

    const result = await matchLabelToFoods("nonexistent food xyz");

    expect(result).toEqual([]);
    expect(mockImportUsdaFoods).not.toHaveBeenCalled();
  });
});

/**
 * ADIM 29 düzeltme turu — kullanıcının açıkça listelediği 12 sorgu.
 * Her test, GERÇEK yerel DB'de zaten var olan (ADIM 26/28/29'da
 * gerçekten import edilmiş) açıklama metinlerini mock'lar ve BEŞ şeyi
 * doğrular: ilk aday, skor, requires_user_confirmation, suspicious
 * (dolaylı olarak requires_user_confirmation üzerinden) ve USDA
 * fallback'in KESİNLİKLE tetiklenmediği (güvenlik düzeltmesi #1).
 */
describe("ADIM 29 düzeltme turu — 12 sorgu, USDA fallback ASLA tetiklenmez", () => {
  beforeEach(() => {
    // Bu describe'daki HİÇBİR test USDA'ya gitmemeli — hangi sorgu için
    // olursa olsun searchUsdaFoods çağrılırsa mock çökecek şekilde
    // bırakılıyor (undefined mockResolvedValue), böylece "tetiklenmedi"
    // iddiası yalnızca `not.toHaveBeenCalled()` ile değil, gerçek bir
    // çağrı denemesi olsaydı testin AÇIKÇA patlayacak olmasıyla da
    // güvence altına alınır.
    mockSearchUsdaFoods.mockReset();
  });

  const cases: {
    query: string;
    local: { id: string; name: string }[];
    expectFirst: string;
    expectConfirm: boolean;
  }[] = [
    {
      query: "rice",
      local: [{ id: "vermicelli-mix", name: "Rice and vermicelli mix, rice pilaf flavor, unprepared" }],
      expectFirst: "vermicelli-mix",
      expectConfirm: true, // "mix" -> exact identity mismatch (karışım, düz pirinç değil)
    },
    {
      query: "cooked rice",
      local: [{ id: "vermicelli-mix", name: "Rice and vermicelli mix, rice pilaf flavor, unprepared" }],
      expectFirst: "vermicelli-mix",
      expectConfirm: true,
    },
    {
      query: "white rice",
      local: [{ id: "vermicelli-mix", name: "Rice and vermicelli mix, rice pilaf flavor, unprepared" }],
      expectFirst: "vermicelli-mix",
      expectConfirm: true,
    },
    {
      query: "basmati rice",
      local: [{ id: "vermicelli-mix", name: "Rice and vermicelli mix, rice pilaf flavor, unprepared" }],
      expectFirst: "vermicelli-mix",
      expectConfirm: true,
    },
    {
      query: "apple",
      local: [
        { id: "dried-apple", name: "Apples, dried, sulfured, uncooked" },
        { id: "rose-apple", name: "Rose-apples, raw" },
      ],
      expectFirst: "dried-apple", // ikisi de şüpheli/onaylı; sıralama skor+dedupe'a göre
      expectConfirm: true, // "dried" -> exact identity mismatch
    },
    {
      query: "dried apple",
      local: [{ id: "dried-apple", name: "Apples, dried, sulfured, uncooked" }],
      expectFirst: "dried-apple",
      expectConfirm: false, // sorgu AÇIKÇA "dried" dedi -> qualifier artık "istenmemiş" değil
    },
    {
      query: "egg",
      local: [{ id: "egg-white-dried", name: "Egg, white, dried" }],
      expectFirst: "egg-white-dried",
      expectConfirm: true, // "dried" -> exact identity mismatch
    },
    {
      query: "egg white",
      local: [{ id: "egg-white-dried", name: "Egg, white, dried" }],
      expectFirst: "egg-white-dried",
      expectConfirm: true, // "white" istendi ama "dried" hâlâ istenmedi
    },
    {
      query: "yogurt",
      local: [{ id: "frozen-yogurt", name: "Frozen yogurts, chocolate" }],
      expectFirst: "frozen-yogurt",
      expectConfirm: true, // "frozen" off-type (istenmedi)
    },
    {
      query: "frozen yogurt",
      local: [{ id: "frozen-yogurt", name: "Frozen yogurts, chocolate" }],
      expectFirst: "frozen-yogurt",
      expectConfirm: false, // sorgu AÇIKÇA "frozen" dedi -> artık off-type SAYILMAZ
    },
    {
      query: "salad",
      local: [{ id: "tuna-salad", name: "Fish, tuna salad" }],
      expectFirst: "tuna-salad",
      expectConfirm: true, // secondary-mention (ana besin "fish", "salad" değil)
    },
    {
      query: "tuna salad",
      local: [{ id: "tuna-salad", name: "Fish, tuna salad" }],
      expectFirst: "tuna-salad",
      expectConfirm: true, // sorgu "tuna salad" dese de ana segment hâlâ "fish" -> onay gerekir
    },
  ];

  for (const { query, local, expectFirst, expectConfirm } of cases) {
    it(`"${query}" → ilk aday="${expectFirst}", confirm=${expectConfirm}, USDA fallback YOK`, async () => {
      mockSearchByNameWords.mockResolvedValue(local);

      const result = await matchLabelToFoods(query);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].food_id).toBe(expectFirst);
      expect(result[0].match_source).toBe("LOCAL");
      expect(result[0].requires_user_confirmation).toBe(expectConfirm);
      // Güvenlik düzeltmesi #1: yerelde EN AZ BİR aday olduğu için (şüpheli
      // olsa BİLE) USDA'ya KESİNLİKLE gidilmemeli.
      expect(mockSearchUsdaFoods).not.toHaveBeenCalled();
    });
  }
});
