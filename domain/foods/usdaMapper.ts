import type { FoodNutritionFactsPer100g } from "@/domain/nutrition/calculation";
import { USDA_NUTRIENT_NUMBER, type UsdaFood } from "./usdaTypes";

export interface MappedUsdaFood {
  name: string;
  facts: FoodNutritionFactsPer100g;
  sourceRef: string;
  /** USDA'nın kendi veri kalitesi/kategorisi ayrımı — ör. "Foundation", "SR Legacy". */
  sourceDataType: string;
}

export interface MappingProblem {
  fdcId: number;
  description: string;
  reason: string;
}

export type MapUsdaFoodResult =
  | { ok: true; food: MappedUsdaFood }
  | { ok: false; problem: MappingProblem };

function findAmount(food: UsdaFood, nutrientNumber: string): number | null {
  const entry = food.foodNutrients.find(
    (n) => n.nutrient.number === nutrientNumber,
  );
  return typeof entry?.amount === "number" ? entry.amount : null;
}

/**
 * Bir USDA FDC besin kaydını, ADIM 16'nın beklediği 100g-başına şekle
 * çevirir. SAF bir fonksiyondur — ağa/DB'ye erişmez.
 *
 * KURAL: energy/protein/fat/carbohydrate USDA'nın Foundation/SR Legacy veri
 * tiplerinde HER ZAMAN raporlanan temel makrolardır — biri eksikse bu,
 * kaydın eksik/anormal olduğunun işaretidir ve "mapping problem" olarak
 * atlanır (varsayılan bir değerle DOLDURULMAZ). Fiber ise gerçek dünyada
 * birçok besin için (ör. çiğ et, süt ürünleri) USDA tarafından hiç
 * raporlanmaz çünkü yapısal olarak yok denecek kadar azdır — bu yüzden
 * eksik fiber, 0 olarak kabul edilir (bu bir "uydurma" değil, USDA'nın
 * kendi veri toplama pratiğiyle tutarlı bir varsayılandır).
 */
/**
 * Bu proje YALNIZCA Foundation ve SR Legacy veri tiplerini destekler (bkz.
 * domain/foods/README.md — Branded'ın porsiyon-bazlı, birim dönüşümü
 * gerektirebilecek yapısı henüz desteklenmiyor). `listUsdaFoods` zaten bu
 * ikisiyle filtrelenmiş sonuç döner, ama açık fdcId'lerle çağrılan eski
 * CLI modunda (bkz. scripts/import-usda-foods.ts) rastgele bir fdcId
 * Branded/Survey olabilir — bu yüzden burada AYRICA doğrulanır.
 */
const SUPPORTED_DATA_TYPES = new Set(["Foundation", "SR Legacy"]);

export function mapUsdaFoodToVerifiedFood(food: UsdaFood): MapUsdaFoodResult {
  if (!SUPPORTED_DATA_TYPES.has(food.dataType)) {
    return {
      ok: false,
      problem: {
        fdcId: food.fdcId,
        description: food.description,
        reason: `Desteklenmeyen dataType: "${food.dataType}" (yalnızca Foundation/SR Legacy desteklenir)`,
      },
    };
  }

  const energy = findAmount(food, USDA_NUTRIENT_NUMBER.ENERGY_KCAL);
  const protein = findAmount(food, USDA_NUTRIENT_NUMBER.PROTEIN_G);
  const fat = findAmount(food, USDA_NUTRIENT_NUMBER.FAT_G);
  const carbohydrate = findAmount(food, USDA_NUTRIENT_NUMBER.CARBOHYDRATE_G);
  const fiber = findAmount(food, USDA_NUTRIENT_NUMBER.FIBER_G) ?? 0;

  const missing: string[] = [];
  if (energy === null) missing.push("energy (208)");
  if (protein === null) missing.push("protein (203)");
  if (fat === null) missing.push("fat (204)");
  if (carbohydrate === null) missing.push("carbohydrate (205)");

  if (missing.length > 0) {
    return {
      ok: false,
      problem: {
        fdcId: food.fdcId,
        description: food.description,
        reason: `Eksik temel makro: ${missing.join(", ")}`,
      },
    };
  }

  return {
    ok: true,
    food: {
      name: food.description,
      facts: {
        energy_kcal_per_100g: energy as number,
        protein_g_per_100g: protein as number,
        carbohydrates_g_per_100g: carbohydrate as number,
        fat_g_per_100g: fat as number,
        fiber_g_per_100g: fiber,
      },
      sourceRef: String(food.fdcId),
      sourceDataType: food.dataType,
    },
  };
}
