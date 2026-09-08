/**
 * USDA FoodData Central API'sinin `/food/{fdcId}` ve `/foods` uç
 * noktalarının GERÇEK yanıt şeklinin, bu projenin kullandığı alt kümesi.
 *
 * Bu tipler, 2026-09-08'de fdc.nal.usda.gov'a yapılan canlı API
 * çağrılarıyla DOĞRULANMIŞTIR (bkz. domain/foods/usdaMapper.test.ts'teki
 * gerçek fixture — fdcId 331960, fdc.nal.usda.gov/food-details/331960/nutrients
 * adresinden bağımsız olarak doğrulanabilir). Tahmin/varsayım değildir.
 */

export interface UsdaNutrient {
  id: number;
  /** USDA'nın klasik nutrient numarası — string olarak gelir (ör. "208"). */
  number: string;
  name: string;
  unitName: string;
}

export interface UsdaFoodNutrient {
  nutrient: UsdaNutrient;
  /** 100g başına miktar (Foundation/SR Legacy veri tipleri için). */
  amount?: number;
}

export interface UsdaFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: UsdaFoodNutrient[];
}

/**
 * Doğrulanmış USDA nutrient numaraları (bkz. yukarıdaki not).
 * Kaynak: USDA FoodData Central nutrient numaralandırması (SR/FNDDS ile
 * ortak, onlarca yıldır değişmeyen bir standart).
 */
export const USDA_NUTRIENT_NUMBER = {
  ENERGY_KCAL: "208",
  PROTEIN_G: "203",
  FAT_G: "204",
  CARBOHYDRATE_G: "205",
  FIBER_G: "291",
} as const;
