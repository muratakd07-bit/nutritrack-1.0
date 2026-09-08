/**
 * ADIM 16 — gerçek Supabase Postgres'e karşı çalışan entegrasyon testi.
 *
 * Bu dosya normal `npm test`/CI akışının bir parçası DEĞİLDİR (mock yok,
 * gerçek ağ/DB gerektirir) — yalnızca `RUN_DB_INTEGRATION_TESTS=1` ortam
 * değişkeni set edildiğinde çalışır, aksi halde atlanır. Çalıştırmak için:
 *
 *   node --env-file=.env.local node_modules/.bin/vitest run \
 *     domain/nutrition/contract.integration.test.ts
 *
 * (.env.local'e RUN_DB_INTEGRATION_TESTS=1 eklenmeli ya da shell'den
 * ayrıca export edilmeli.)
 *
 * Kullandığı tüm test verisi (`randomUUID()` ile üretilen kullanıcı/besin)
 * `afterAll`'da tamamen silinir — gerçek projede kalıcı iz bırakmaz.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "1";

describe.skipIf(!RUN)(
  "ADIM 16 — gerçek Supabase Postgres entegrasyon testi",
  () => {
    let prisma: typeof import("@/lib/db/prisma").prisma;
    let createVerifiedFood: typeof import("@/domain/foods/service").createVerifiedFood;
    let foodsRepository: typeof import("@/domain/foods/repository").foodsRepository;
    let nutritionSourceOfTruth: typeof import("@/domain/nutrition/contract").nutritionSourceOfTruth;
    let createMealItemForUser: typeof import("@/domain/meal/service").createMealItemForUser;
    let listMealItemsForUser: typeof import("@/domain/meal/service").listMealItemsForUser;
    let getDailySummaryForUser: typeof import("@/domain/reports/dailySummary").getDailySummaryForUser;

    const testRunId = randomUUID();
    const userId = randomUUID();
    const cleanupUserIds: string[] = [userId];
    const cleanupFoodIds: string[] = [];

    const BASE_FACTS = {
      energy_kcal_per_100g: 100,
      protein_g_per_100g: 10,
      carbohydrates_g_per_100g: 20,
      fat_g_per_100g: 5,
      fiber_g_per_100g: 2,
    };

    beforeAll(async () => {
      ({ prisma } = await import("@/lib/db/prisma"));
      ({ createVerifiedFood } = await import("@/domain/foods/service"));
      ({ foodsRepository } = await import("@/domain/foods/repository"));
      ({ nutritionSourceOfTruth } = await import("@/domain/nutrition/contract"));
      ({ createMealItemForUser, listMealItemsForUser } = await import(
        "@/domain/meal/service"
      ));
      ({ getDailySummaryForUser } = await import(
        "@/domain/reports/dailySummary"
      ));

      await prisma.user.create({
        data: { id: userId, email: `adim16-itest-${testRunId}@test.invalid` },
      });
    });

    afterAll(async () => {
      // User silme Meal/MealItem'ları cascade siler (schema.prisma'daki
      // onDelete: Cascade ilişkileri) — bu da o davranışın gerçekten
      // çalıştığının dolaylı bir kanıtıdır.
      for (const uid of cleanupUserIds) {
        await prisma.user.deleteMany({ where: { id: uid } });
      }
      for (const fid of cleanupFoodIds) {
        await prisma.food.deleteMany({ where: { id: fid } });
      }
    });

    async function createTestFood(
      nameSuffix: string,
      facts = BASE_FACTS,
    ) {
      const food = await createVerifiedFood({
        name: `ADIM16 itest ${testRunId} ${nameSuffix}`,
        facts,
        source: "TEST_FIXTURE",
        // ADIM 26'da (source, sourceRef) üzerine eklenen @@unique kısıtı
        // nedeniyle her test food'u için FARKLI bir sourceRef gerekir.
        sourceRef: `${testRunId}-${nameSuffix}`,
      });
      cleanupFoodIds.push(food.id);
      return food;
    }

    it("gerçek contract: 150g için doğru ölçeklenmiş sonucu hesaplar", async () => {
      const food = await createTestFood("calc");

      const result = await nutritionSourceOfTruth.getCalculatedNutrition({
        food_id: food.id,
        consumed_weight_g: 150,
        meal_type: "BREAKFAST",
      });

      expect(result).toEqual({
        energy_kcal: 150,
        protein_g: 15,
        carbohydrates_g: 30,
        fat_g: 7.5,
        fiber_g: 3,
      });
    });

    it("facts bulunamayan bir food_id için hata fırlatır (uydurma değer DÖNMEZ)", async () => {
      await expect(
        nutritionSourceOfTruth.getCalculatedNutrition({
          food_id: randomUUID(),
          consumed_weight_g: 100,
          meal_type: "BREAKFAST",
        }),
      ).rejects.toThrow();
    });

    it("createMealItemForUser gerçek DB'ye gerçek hesaplanmış değeri yazar", async () => {
      const food = await createTestFood("meal-write");

      const mealItem = await createMealItemForUser(userId, {
        food_id: food.id,
        consumed_weight_g: 200,
        meal_type: "LUNCH",
      });

      expect(mealItem.energyKcal).toBe(200);
      expect(mealItem.proteinG).toBe(20);
      expect(mealItem.userId).toBe(userId);
    });

    it("idempotency: aynı key ile tekrar çağrıldığında yeniden hesaplamaz/yeni kayıt açmaz", async () => {
      const food = await createTestFood("idem");
      const key = `itest-idem-${testRunId}`;

      const first = await createMealItemForUser(userId, {
        food_id: food.id,
        consumed_weight_g: 100,
        meal_type: "SNACK",
        idempotency_key: key,
      });
      const second = await createMealItemForUser(userId, {
        food_id: food.id,
        consumed_weight_g: 500,
        meal_type: "SNACK",
        idempotency_key: key,
      });

      expect(second.id).toBe(first.id);
      expect(second.consumedWeightG).toBe(100);
    });

    it("user isolation: bir kullanıcının meal item'ı başka bir kullanıcıda görünmez", async () => {
      const otherUserId = randomUUID();
      cleanupUserIds.push(otherUserId);
      await prisma.user.create({
        data: {
          id: otherUserId,
          email: `adim16-itest-other-${testRunId}@test.invalid`,
        },
      });

      const food = await createTestFood("isolation");
      await createMealItemForUser(userId, {
        food_id: food.id,
        consumed_weight_g: 100,
        meal_type: "BREAKFAST",
      });

      const otherUsersItems = await listMealItemsForUser(otherUserId);
      expect(otherUsersItems).toHaveLength(0);
    });

    it("snapshot: facts sonradan düzeltilse bile ZATEN oluşturulmuş meal item değişmez", async () => {
      const food = await createTestFood("snapshot");

      const mealItem = await createMealItemForUser(userId, {
        food_id: food.id,
        consumed_weight_g: 100,
        meal_type: "DINNER",
      });
      expect(mealItem.energyKcal).toBe(100);

      // "Admin bu besinin değerini düzeltiyor" senaryosu.
      await foodsRepository.upsertNutritionFacts(
        food.id,
        { ...BASE_FACTS, energy_kcal_per_100g: 999 },
        { source: "TEST_FIXTURE_CORRECTION" },
      );

      const reloaded = await prisma.mealItem.findUniqueOrThrow({
        where: { id: mealItem.id },
      });
      expect(reloaded.energyKcal).toBe(100); // snapshot SESSİZCE değişmedi

      const newMealItem = await createMealItemForUser(userId, {
        food_id: food.id,
        consumed_weight_g: 100,
        meal_type: "SNACK",
        idempotency_key: `itest-after-correction-${testRunId}`,
      });
      expect(newMealItem.energyKcal).toBe(999); // yeni kayıt güncel değeri kullanır
    });

    it("günlük toplam: birden fazla meal item'ın hesaplanmış değerlerini doğru toplar", async () => {
      const summaryUserId = randomUUID();
      cleanupUserIds.push(summaryUserId);
      await prisma.user.create({
        data: {
          id: summaryUserId,
          email: `adim16-itest-summary-${testRunId}@test.invalid`,
        },
      });

      const food = await createTestFood("summary");
      await createMealItemForUser(summaryUserId, {
        food_id: food.id,
        consumed_weight_g: 100,
        meal_type: "BREAKFAST",
      });
      await createMealItemForUser(summaryUserId, {
        food_id: food.id,
        consumed_weight_g: 200,
        meal_type: "LUNCH",
      });

      const summary = await getDailySummaryForUser(summaryUserId, new Date());

      expect(summary.item_count).toBe(2);
      expect(summary.energy_kcal).toBe(300);
      expect(summary.protein_g).toBe(30);
    });
  },
);
