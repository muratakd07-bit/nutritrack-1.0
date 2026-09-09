import { describe, expect, it } from "vitest";
import { scoreFoodCandidate, scoreUsdaCandidate } from "./foodMatchScoring";

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

/**
 * ADIM 29 — FoodMatcher v2 özel test case'leri (kullanıcının listelediği
 * 14 sorgu). Açıklama metinleri, USDA'nın SR Legacy/Foundation taksonomi
 * biçimini yansıtan TEMSİLİ örneklerdir (bazıları — "Rice crackers",
 * "Fish, tuna salad", tavuk göğsü kaydı — ADIM 27/28'de GERÇEKTEN
 * gözlemlenmiş/import edilmiş gerçek verilerdir).
 */
describe("ADIM 29 — özel test case'leri", () => {
  it("rice → 'Rice crackers' değil, gerçek pirinç kaydı üste çıkar", () => {
    const rice = scoreFoodCandidate("rice", "Rice, white, long-grain, regular, cooked");
    const crackers = scoreFoodCandidate("rice", "Rice crackers");
    expect(rice).toBeGreaterThan(crackers);
  });

  it("cooked rice → pişmiş pirinç, çiğ pirinçten yüksek puan alır (durum çelişkisi)", () => {
    const cooked = scoreFoodCandidate("cooked rice", "Rice, white, long-grain, cooked");
    const raw = scoreFoodCandidate("cooked rice", "Rice, white, long-grain, raw");
    expect(cooked).toBeGreaterThan(raw);
  });

  it("white rice → beyaz pirinç, kahverengi pirinçten yüksek puan alır (çeşit çelişkisi)", () => {
    const white = scoreFoodCandidate("white rice", "Rice, white, long-grain, cooked");
    const brown = scoreFoodCandidate("white rice", "Rice, brown, long-grain, cooked");
    expect(white).toBeGreaterThan(brown);
  });

  it("basmati rice → 'basmati' geçen kayıt, geçmeyenden yüksek puan alır", () => {
    const basmati = scoreFoodCandidate("basmati rice", "Rice, basmati, cooked");
    const generic = scoreFoodCandidate("basmati rice", "Rice, white, long-grain, cooked");
    expect(basmati).toBeGreaterThan(generic);
  });

  it("chicken → tavuk göğsü (GERÇEK ADIM 26 kaydı), tavuklu çorbadan yüksek puan alır", () => {
    const breast = scoreFoodCandidate(
      "chicken",
      "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised",
    );
    const soup = scoreFoodCandidate("chicken", "Soup, chicken noodle, canned");
    expect(breast).toBeGreaterThan(soup);
  });

  it("chicken stir fry → GERÇEK tavuk göğsü kaydı hâlâ yüksek puan alır ('stir'/'fry' gürültü kelimesi cezalandırmaz)", () => {
    // ADIM 27'nin canlı fotoğraf testinde Qwen3-VL'nin GERÇEKTEN döndürdüğü
    // etikettir — "stir"/"fry" USDA açıklamalarında neredeyse hiç
    // geçmediği için bunları payda'dan hariç tutmazsak gerçek, doğru bir
    // eşleşme yapay olarak cezalandırılır (bu regresyon canlı olarak
    // bulundu — bkz. domain/foods/foodMatcher.test.ts).
    const score = scoreFoodCandidate(
      "chicken stir fry",
      "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised",
    );
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("chicken breast → göğüs kaydı, but (thigh) kaydından yüksek puan alır (vücut parçası çelişkisi)", () => {
    const breast = scoreFoodCandidate(
      "chicken breast",
      "Chicken, broiler or fryers, breast, meat only, cooked, roasted",
    );
    const thigh = scoreFoodCandidate(
      "chicken breast",
      "Chicken, broiler or fryers, thigh, meat only, cooked, roasted",
    );
    expect(breast).toBeGreaterThan(thigh);
  });

  it("chicken thigh → but kaydı, göğüs kaydından yüksek puan alır (ters yönde de aynı çelişki)", () => {
    // Bu, GERÇEK yerel DB'de yalnızca bir tavuk GÖĞSÜ kaydı varken
    // "chicken thigh" arandığında ne olacağını da açıklar (bkz.
    // domain/foods/foodMatcher.test.ts — bu durumda tek yerel aday
    // vücut parçası çelişkisi YÜZÜNDEN düşük puan alır ve
    // requires_user_confirmation=true olur; sessizce "göğüs" gösterilmez).
    const thigh = scoreFoodCandidate(
      "chicken thigh",
      "Chicken, broiler or fryers, thigh, meat only, cooked, roasted",
    );
    const breast = scoreFoodCandidate(
      "chicken thigh",
      "Chicken, broiler or fryers, breast, meat only, cooked, roasted",
    );
    expect(thigh).toBeGreaterThan(breast);
    expect(breast).toBeLessThan(0.75); // tek başına GÜVENİLİR/otomatik sayılamaz
  });

  it("egg → gerçek yumurta kaydı, yumurta İKAMESİNDEN (substitute) yüksek puan alır", () => {
    const realEgg = scoreFoodCandidate("egg", "Egg, whole, raw, fresh");
    const substitute = scoreFoodCandidate("egg", "Egg substitute, powder");
    expect(realEgg).toBeGreaterThan(substitute);
  });

  it("egg white → 'Egg, white, dried' kaydı, düz 'Egg, whole, raw' kaydından yüksek puan alır", () => {
    const white = scoreFoodCandidate("egg white", "Egg, white, dried");
    const whole = scoreFoodCandidate("egg white", "Egg, whole, raw, fresh");
    expect(white).toBeGreaterThan(whole);
  });

  it("yogurt → gerçek yoğurt, dondurulmuş yoğurttan (frozen yogurt) yüksek puan alır", () => {
    const plain = scoreFoodCandidate("yogurt", "Yogurt, plain, whole milk");
    const frozen = scoreFoodCandidate("yogurt", "Frozen yogurts, chocolate");
    expect(plain).toBeGreaterThan(frozen);
  });

  it("frozen yogurt → sorgu AÇIKÇA 'frozen' dediğinde artık cezalandırılmaz (negation-farkında hariç tutma)", () => {
    // Kritik ayrım: AYNI aday ("Frozen yogurts, chocolate"), sorgu neyi
    // İSTEDİĞİNE göre FARKLI puanlanır — bu, "off-type" cezasının kör bir
    // kelime yasağı değil, "sorgu bunu İSTEMEDİYSE" mantığı olduğunu
    // kanıtlar.
    const asFrozenQuery = scoreFoodCandidate("frozen yogurt", "Frozen yogurts, chocolate");
    const asPlainQuery = scoreFoodCandidate("yogurt", "Frozen yogurts, chocolate");
    expect(asFrozenQuery).toBeGreaterThan(asPlainQuery);
  });

  it("salad → gerçek bir salata, ham/tuna salata karışımlarından yüksek puan alır", () => {
    const realSalad = scoreFoodCandidate("salad", "Salad, vegetable, tossed, without dressing");
    const hamSalad = scoreFoodCandidate("salad", "Ham salad spread");
    const tunaSalad = scoreFoodCandidate("salad", "Fish, tuna salad");
    expect(realSalad).toBeGreaterThan(hamSalad);
    expect(realSalad).toBeGreaterThan(tunaSalad);
  });

  it("salad → GERÇEK yerel veride bulunan 'Salad dressing, coleslaw', gerçek salata seçeneklerinin ÜSTÜNE çıkmaz", () => {
    // ADIM 29'da gerçek yerel veriyle test edilirken bulundu: baş segment
    // eşleşmesi bonusu ("Salad dressing" ifadesinin baş kelimesi "salad"
    // ile eşleşiyor) + zayıf bir off-type cezası, "Salad dressing"in
    // gerçek salata seçeneklerinden DAHA YÜKSEK puan almasına yol
    // açıyordu — off-type cezası güçlendirilerek düzeltildi.
    const dressing = scoreFoodCandidate("salad", "Salad dressing, coleslaw");
    const sideSalad = scoreFoodCandidate("salad", "McDONALD'S, Side Salad");
    const tunaSalad = scoreFoodCandidate("salad", "Fish, tuna salad");
    expect(dressing).toBeLessThan(sideSalad);
    expect(dressing).toBeLessThan(tunaSalad);
  });

  it("tuna salad → sorgu AÇIKÇA 'tuna salad' dediğinde gerçek 'Fish, tuna salad' kaydı, alakasız bir sebze salatasından yüksek puan alır", () => {
    const tunaMatch = scoreFoodCandidate("tuna salad", "Fish, tuna salad");
    const unrelatedSalad = scoreFoodCandidate(
      "tuna salad",
      "Salad, vegetable, tossed, without dressing",
    );
    expect(tunaMatch).toBeGreaterThan(unrelatedSalad);
  });

  it("apple → gerçek elma, elmalı turtadan (pie) yüksek puan alır", () => {
    const realApple = scoreFoodCandidate("apple", "Apples, raw, with skin");
    const pie = scoreFoodCandidate("apple", "Pie, Dutch Apple, Commercially Prepared");
    expect(realApple).toBeGreaterThan(pie);
  });

  it("Türkçe/İngilizce eşleşme: 'tavuk' sorgusu gerçek tavuk göğsü kaydını bulur", () => {
    const score = scoreFoodCandidate(
      "tavuk",
      "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised",
    );
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("Türkçe/İngilizce eşleşme: 'pirinç' sorgusu gerçek pirinç kaydını bulur, krakerden yüksek puan alır", () => {
    const rice = scoreFoodCandidate("pirinç", "Rice, white, long-grain, regular, cooked");
    const crackers = scoreFoodCandidate("pirinç", "Rice crackers");
    expect(rice).toBeGreaterThan(crackers);
  });

  it("Türkçe/İngilizce eşleşme: 'çiğ tavuk' (raw chicken) sorgusu pişmiş kayıttan çok çiğ kaydı tercih eder", () => {
    const raw = scoreFoodCandidate("çiğ tavuk", "Chicken, breast, raw");
    const cooked = scoreFoodCandidate("çiğ tavuk", "Chicken, breast, cooked, roasted");
    expect(raw).toBeGreaterThan(cooked);
  });

  it("exact match: sorgu ile açıklama birebir aynıysa (normalize edilmiş) skor tam 1'dir", () => {
    expect(scoreFoodCandidate("Chicken Breast", "chicken breast")).toBe(1);
  });
});
