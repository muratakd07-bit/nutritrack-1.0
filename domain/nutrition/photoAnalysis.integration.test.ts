/**
 * ADIM 27 — gerçek Supabase Postgres'e karşı çalışan uçtan uca entegrasyon
 * testi: mock AI → gerçek FoodMatcher → SİMÜLE EDİLMİŞ kullanıcı onayı →
 * gerçek ADIM 16 hesaplaması → gerçek meal item → gerçek günlük toplam.
 *
 * Normal `npm test` akışının parçası DEĞİLDİR — yalnızca
 * `RUN_DB_INTEGRATION_TESTS=1` set edildiğinde çalışır. Çalıştırmak için:
 *
 *   RUN_DB_INTEGRATION_TESTS=1 node --env-file=.env.local \
 *     node_modules/vitest/vitest.mjs run domain/nutrition/photoAnalysis.integration.test.ts
 *
 * ADIM 26'da gerçek Supabase'e import edilmiş GERÇEK besini (fdcId 331960,
 * tavuk göğsü) kullanır — yeni bir sahte besin uydurmaz. Test kendi
 * ürettiği kullanıcı/meal verisini `afterAll`'da tamamen temizler; ADIM
 * 26'nın gerçek Food/FoodNutritionFacts kaydına DOKUNMAZ/SİLMEZ.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const REAL_CHICKEN_BREAST_FDC_ID = "331960";

describe.skipIf(!RUN)(
  "ADIM 27 — fotoğraf analizi → onay → ADIM 16 → snapshot → günlük toplam (gerçek DB)",
  () => {
    let prisma: typeof import("@/lib/db/prisma").prisma;
    let analyzeFoodPhoto: typeof import("./photoAnalysis").analyzeFoodPhoto;
    let createMealItemForUser: typeof import("@/domain/meal/service").createMealItemForUser;
    let listMealItemsForUser: typeof import("@/domain/meal/service").listMealItemsForUser;
    let getDailySummaryForUser: typeof import("@/domain/reports/dailySummary").getDailySummaryForUser;
    let MockFoodRecognitionSource: typeof import("./foodRecognitionMock").MockFoodRecognitionSource;

    const testRunId = randomUUID();
    const userId = randomUUID();
    const cleanupUserIds: string[] = [userId];
    let realChickenBreastFoodId: string;

    beforeAll(async () => {
      ({ prisma } = await import("@/lib/db/prisma"));
      ({ analyzeFoodPhoto } = await import("./photoAnalysis"));
      ({ createMealItemForUser, listMealItemsForUser } = await import(
        "@/domain/meal/service"
      ));
      ({ getDailySummaryForUser } = await import(
        "@/domain/reports/dailySummary"
      ));
      ({ MockFoodRecognitionSource } = await import("./foodRecognitionMock"));

      await prisma.user.create({
        data: { id: userId, email: `adim27-itest-${testRunId}@test.invalid` },
      });

      const facts = await prisma.foodNutritionFacts.findUnique({
        where: { source_sourceRef: { source: "USDA_FDC", sourceRef: REAL_CHICKEN_BREAST_FDC_ID } },
      });
      if (!facts) {
        throw new Error(
          "ADIM 26'da import edilmiş gerçek tavuk göğsü kaydı (fdcId 331960) " +
            "bulunamadı — bu test onun varlığına dayanır.",
        );
      }
      realChickenBreastFoodId = facts.foodId;
    });

    afterAll(async () => {
      // Yalnızca BU testin oluşturduğu kullanıcı/meal verisi silinir.
      // User cascade siler (meals/mealItems) — ADIM 26'nın gerçek
      // food/facts kaydına HİÇ dokunulmaz.
      for (const uid of cleanupUserIds) {
        await prisma.user.deleteMany({ where: { id: uid } });
      }
    });

    it("mock AI + gerçek FoodMatcher, gerçek 'tavuk göğsü' kaydını bulur", async () => {
      const mockSource = new MockFoodRecognitionSource({
        candidate_labels: [{ label: "grilled chicken breast", confidence: 0.9 }],
        estimated_weight_g: 150,
        visual_description: "Griddle-marked chicken breast.",
      });

      const analysis = await analyzeFoodPhoto(
        { image_base64: "test", mime_type: "image/jpeg" },
        { recognitionSource: mockSource },
      );

      const found = analysis.candidates.find(
        (c) => c.food_id === realChickenBreastFoodId,
      );
      expect(found).toBeDefined();
      expect(found?.match_source).toBe("LOCAL");
      expect(analysis.is_unrecognized).toBe(false);
    });

    it("uçtan uca: analiz → kullanıcı onayı (AI tahmininden FARKLI gramaj) → gerçek ADIM 16 hesabı → snapshot", async () => {
      const mockSource = new MockFoodRecognitionSource({
        candidate_labels: [{ label: "grilled chicken breast", confidence: 0.9 }],
        estimated_weight_g: 150, // AI'nin tahmini
        visual_description: "desc",
      });

      const analysis = await analyzeFoodPhoto(
        { image_base64: "test-2", mime_type: "image/jpeg" },
        { recognitionSource: mockSource },
      );

      const candidate = analysis.candidates.find(
        (c) => c.food_id === realChickenBreastFoodId,
      );
      expect(candidate).toBeDefined();

      // KULLANICI ONAYI SİMÜLASYONU: AI 150g dedi, kullanıcı 200g olarak DÜZELTTİ.
      const userConfirmedWeightG = 200;
      expect(userConfirmedWeightG).not.toBe(analysis.estimated_weight_g);

      const mealItem = await createMealItemForUser(userId, {
        food_id: candidate!.food_id,
        consumed_weight_g: userConfirmedWeightG,
        meal_type: "LUNCH",
      });

      // Gerçek ADIM 16 hesabı: 166 kcal/100g * 2 = 332 kcal (AI'DAN DEĞİL).
      expect(mealItem.energyKcal).toBe(332);
      expect(mealItem.proteinG).toBe(64.2); // 32.1 * 2
      expect(mealItem.consumedWeightG).toBe(200);
      expect(mealItem.userId).toBe(userId);
    });

    it("idempotency: aynı onaylanmış analiz aynı key ile tekrar gönderilirse yeniden hesaplamaz", async () => {
      const key = `adim27-itest-idem-${testRunId}`;
      const first = await createMealItemForUser(userId, {
        food_id: realChickenBreastFoodId,
        consumed_weight_g: 100,
        meal_type: "SNACK",
        idempotency_key: key,
      });
      const second = await createMealItemForUser(userId, {
        food_id: realChickenBreastFoodId,
        consumed_weight_g: 999,
        meal_type: "SNACK",
        idempotency_key: key,
      });

      expect(second.id).toBe(first.id);
      expect(second.consumedWeightG).toBe(100);
    });

    it("user isolation: bu kullanıcının onaylanmış meal item'ı başka bir kullanıcıda görünmez", async () => {
      const otherUserId = randomUUID();
      cleanupUserIds.push(otherUserId);
      await prisma.user.create({
        data: {
          id: otherUserId,
          email: `adim27-itest-other-${testRunId}@test.invalid`,
        },
      });

      const otherUsersItems = await listMealItemsForUser(otherUserId);
      expect(otherUsersItems).toHaveLength(0);
    });

    it("günlük toplam: fotoğraftan eklenen öğün(ler) toplam nutrition'a doğru yansır", async () => {
      const summaryUserId = randomUUID();
      cleanupUserIds.push(summaryUserId);
      await prisma.user.create({
        data: {
          id: summaryUserId,
          email: `adim27-itest-summary-${testRunId}@test.invalid`,
        },
      });

      const mockSource = new MockFoodRecognitionSource({
        candidate_labels: [{ label: "grilled chicken breast", confidence: 0.9 }],
        estimated_weight_g: 100,
        visual_description: "desc",
      });
      const analysis = await analyzeFoodPhoto(
        { image_base64: "test-3", mime_type: "image/jpeg" },
        { recognitionSource: mockSource },
      );
      const candidate = analysis.candidates[0];

      await createMealItemForUser(summaryUserId, {
        food_id: candidate.food_id,
        consumed_weight_g: 100,
        meal_type: "BREAKFAST",
      });

      const summary = await getDailySummaryForUser(summaryUserId, new Date());
      expect(summary.item_count).toBe(1);
      expect(summary.energy_kcal).toBe(166); // gerçek 100g değeri, AI'dan değil
    });

    it("AI çıktısı geçersizse (şema doğrulaması) hiçbir şey oluşturulmadan reddedilir", async () => {
      // Tip seviyesinde geçerli (confidence bir number'dır) ama ZOD şeması
      // [0,1] aralığını zorunlu kılar — bu kasıtlı olarak aralık dışı.
      const invalidMockSource = new MockFoodRecognitionSource({
        candidate_labels: [{ label: "x", confidence: 99 }],
        estimated_weight_g: 100,
        visual_description: "desc",
      });

      await expect(
        analyzeFoodPhoto(
          { image_base64: "test-invalid", mime_type: "image/jpeg" },
          { recognitionSource: invalidMockSource },
        ),
      ).rejects.toThrow();
    });
  },
);
