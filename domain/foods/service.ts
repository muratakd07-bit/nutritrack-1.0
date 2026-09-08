import type { Food } from "@prisma/client";
import { foodsRepository } from "./repository";
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
