import { describe, expect, it } from "vitest";
import { scoreUsdaCandidate } from "./foodMatchScoring";

/**
 * Aşağıdaki açıklama metinleri, USDA FoodData Central'ın SR Legacy/
 * Foundation veri setindeki GERÇEK, iyi bilinen adlandırma kalıplarını
 * (taksonomik "Ana besin, tanımlayıcı, tanımlayıcı" formatı) yansıtan
 * TEMSİLİ örneklerdir — bu test dosyası, DEMO_KEY'in rate limit'e
 * takıldığı bir anda yazıldığı için canlı bir API çağrısıyla yeniden
 * doğrulanamadı. "Rice crackers" ve "Fish, tuna salad" ise GERÇEKTEN,
 * ADIM 27'nin canlı testinde bugün gözlemlenen gerçek USDA yanıtlarıdır
 * (bkz. domain/foods/foodMatcher.test.ts'teki regresyon testi).
 */
describe("scoreUsdaCandidate", () => {
  it("GERÇEK hata: 'rice' sorgusunda 'Rice crackers' düşük, 'Rice, white, cooked' yüksek puan alır", () => {
    const crackersScore = scoreUsdaCandidate("rice", "Rice crackers");
    const whiteRiceScore = scoreUsdaCandidate(
      "rice",
      "Rice, white, long-grain, regular, cooked",
    );
    expect(whiteRiceScore).toBeGreaterThan(crackersScore);
  });

  it("GERÇEK hata: 'salad' sorgusunda 'Fish, tuna salad' düşük, gerçek bir salata yüksek puan alır", () => {
    const tunaSaladScore = scoreUsdaCandidate("salad", "Fish, tuna salad");
    const realSaladScore = scoreUsdaCandidate(
      "salad",
      "Salad, vegetable, tossed, without dressing",
    );
    expect(realSaladScore).toBeGreaterThan(tunaSaladScore);
  });

  it("'chicken' sorgusunda tavuk göğsü yüksek, tavuklu çorba/bulyon düşük puan alır", () => {
    const breastScore = scoreUsdaCandidate(
      "chicken",
      "Chicken, broiler or fryers, breast, meat only, cooked, roasted",
    );
    const soupScore = scoreUsdaCandidate("chicken", "Soup, chicken noodle, canned");
    expect(breastScore).toBeGreaterThan(soupScore);
  });

  it("sorgu kelimesi hiç geçmiyorsa 0 döner", () => {
    expect(scoreUsdaCandidate("rice", "Chicken, breast, cooked")).toBe(0);
  });

  it("tam, virgüllü, baş segment eşleşmesi 1'e yakın/eşit üst sınırda kalır (clamp)", () => {
    const score = scoreUsdaCandidate("rice", "Rice, white, long-grain, cooked");
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThan(0.8);
  });

  it("virgülsüz bileşik isim ('Potato chips') 'potato' sorgusunda cezalandırılır", () => {
    const chipsScore = scoreUsdaCandidate("potato", "Potato chips");
    const realPotatoScore = scoreUsdaCandidate("potato", "Potatoes, russet, flesh and skin, raw");
    expect(realPotatoScore).toBeGreaterThan(chipsScore);
  });
});
