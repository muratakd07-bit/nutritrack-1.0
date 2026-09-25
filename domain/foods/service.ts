import type { Food } from "@prisma/client";
import { foodsRepository } from "./repository";
import { toCanonicalQuery } from "./foodMatchScoring";
import type { FoodNutritionFactsPer100g } from "@/domain/nutrition/calculation";

export interface CreateVerifiedFoodInput {
  name: string;
  facts: FoodNutritionFactsPer100g;
  source: string;
  sourceRef?: string;
}

/**
 * Sisteme YENİ, doğrulanmış bir besin ekler.
 *
 * KRİTİK: Bu fonksiyon değerleri UYDURMAZ — çağıran taraf (yalnızca ADMIN,
 * bkz. app/api/admin/foods/route.ts) gerçek, doğrulanmış değerleri ve
 * kaynağını (`source`/`sourceRef`) sağlamakla yükümlüdür. Bu, ADIM 16'nın
 * "güvenilir food database/source" kuralının veri girişi tarafındaki
 * karşılığıdır: Claude/otomatik kod hiçbir zaman buraya bir besinin gerçek
 * kalori/makro değerini kendisi üretip yazmaz.
 *
 * ATOMİKLİK: `createFood` + `upsertNutritionFacts` tek bir transaction'da
 * yapılır. Bunsuz, ikinci adım (ör. `(source, sourceRef)` unique
 * kısıtı ihlali) başarısız olduğunda ilk adımda oluşturulan Food satırı
 * sahipsiz (facts'siz) kalırdı — bu tam olarak ADIM 27 sırasında bir
 * entegrasyon testinde gözlemlenip düzeltilen gerçek bir hataydı.
 */
export async function createVerifiedFood(
  input: CreateVerifiedFoodInput,
): Promise<Food> {
  return foodsRepository.runInTransaction(async (tx) => {
    const food = await foodsRepository.createFood(input.name, tx);
    await foodsRepository.upsertNutritionFacts(
      food.id,
      input.facts,
      { source: input.source, sourceRef: input.sourceRef },
      tx,
    );
    return food;
  });
}

export interface FoodSearchResult {
  food_id: string;
  name: string;
  /** DB'deki doğrulanmış 100g referans değerleri — tüketilen miktar için hesap DEĞİLDİR. */
  per_100g: FoodNutritionFactsPer100g;
  source: string;
}

export const FOOD_SEARCH_MAX_WORDS = 5;

/**
 * Elle öğün eklerken besin araması. Yalnızca doğrulanmış facts'i olan
 * food'ları döner (facts'siz bir food ADIM 16'da zaten hata verir).
 * Döndürülen `per_100g` değerleri kaynak veridir; tüketilen gramaj için
 * nutrition sonucu yalnızca ADIM 16 (POST /api/meals) tarafından üretilir.
 */
export async function searchFoods(
  query: string,
  limit = 20,
): Promise<FoodSearchResult[]> {
  // Food.name'ler (USDA) İngilizce'dir; "pirinç" gibi yaygın Türkçe
  // kelimeler FoodMatcher'ın aynı dar eş anlamlı listesiyle İngilizce
  // karşılığına çevrilir. Arama DB'de büyük/küçük harf duyarsızdır (ILIKE).
  const words = toCanonicalQuery(query)
    .split(" ")
    .filter((w) => w.length > 0)
    .slice(0, FOOD_SEARCH_MAX_WORDS);

  const foods = await foodsRepository.searchWithFactsByName(words, limit);
  return foods.flatMap((food) =>
    food.nutritionFacts
      ? [
          {
            food_id: food.id,
            name: food.name,
            per_100g: {
              energy_kcal_per_100g: food.nutritionFacts.energyKcalPer100g,
              protein_g_per_100g: food.nutritionFacts.proteinGPer100g,
              carbohydrates_g_per_100g: food.nutritionFacts.carbohydratesGPer100g,
              fat_g_per_100g: food.nutritionFacts.fatGPer100g,
              fiber_g_per_100g: food.nutritionFacts.fiberGPer100g,
            },
            source: food.nutritionFacts.source,
          },
        ]
      : [],
  );
}
