import { describe, expect, it } from "vitest";
import {
  roundToOneDecimal,
  scaleNutritionFactsToWeight,
  type FoodNutritionFactsPer100g,
} from "./calculation";

// Sentetik, açıkça test amaçlı 100g değerleri — gerçek bir besini temsil ETMEZ.
const FACTS_100G: FoodNutritionFactsPer100g = {
  energy_kcal_per_100g: 200,
  protein_g_per_100g: 20,
  carbohydrates_g_per_100g: 30,
  fat_g_per_100g: 10,
  fiber_g_per_100g: 4,
};

describe("scaleNutritionFactsToWeight", () => {
  it("100g için 100g başına değerlerin birebir aynısını döner", () => {
    const result = scaleNutritionFactsToWeight(FACTS_100G, 100);
    expect(result).toEqual({
      energy_kcal: 200,
      protein_g: 20,
      carbohydrates_g: 30,
      fat_g: 10,
      fiber_g: 4,
    });
  });

  it("50g için değerleri yarıya ölçekler", () => {
    const result = scaleNutritionFactsToWeight(FACTS_100G, 50);
    expect(result).toEqual({
      energy_kcal: 100,
      protein_g: 10,
      carbohydrates_g: 15,
      fat_g: 5,
      fiber_g: 2,
    });
  });

  it("150g için değerleri 1.5 kat ölçekler", () => {
    const result = scaleNutritionFactsToWeight(FACTS_100G, 150);
    expect(result).toEqual({
      energy_kcal: 300,
      protein_g: 30,
      carbohydrates_g: 45,
      fat_g: 15,
      fiber_g: 6,
    });
  });

  it("gramaj değişince sonuç orantılı olarak değişir", () => {
    const at50 = scaleNutritionFactsToWeight(FACTS_100G, 50);
    const at200 = scaleNutritionFactsToWeight(FACTS_100G, 200);
    expect(at200.energy_kcal).toBe(at50.energy_kcal * 4);
    expect(at200.protein_g).toBe(at50.protein_g * 4);
  });

  it("aynı girdi için her zaman aynı çıktıyı üretir (deterministik)", () => {
    const first = scaleNutritionFactsToWeight(FACTS_100G, 137);
    const second = scaleNutritionFactsToWeight(FACTS_100G, 137);
    expect(first).toEqual(second);
  });

  it("çok küçük gramajlarda da doğru ölçekler (ör. 1g)", () => {
    const result = scaleNutritionFactsToWeight(FACTS_100G, 1);
    expect(result).toEqual({
      energy_kcal: 2,
      protein_g: 0.2,
      carbohydrates_g: 0.3,
      fat_g: 0.1,
      fiber_g: 0,
    });
  });

  it("ondalık kesirli 100g değerlerinde kayan nokta gürültüsünü temizler", () => {
    const facts: FoodNutritionFactsPer100g = {
      energy_kcal_per_100g: 33.333,
      protein_g_per_100g: 1.111,
      carbohydrates_g_per_100g: 2.222,
      fat_g_per_100g: 0.555,
      fiber_g_per_100g: 0.999,
    };
    const result = scaleNutritionFactsToWeight(facts, 100);
    // Her değer 1 ondalığa yuvarlanmış olmalı, ham kayan nokta değeri değil.
    expect(result.energy_kcal).toBe(33.3);
    expect(result.protein_g).toBe(1.1);
    expect(result.carbohydrates_g).toBe(2.2);
    expect(result.fat_g).toBe(0.6);
    expect(result.fiber_g).toBe(1);
  });
});

describe("roundToOneDecimal", () => {
  it("1 ondalık basamağa doğru yuvarlar", () => {
    expect(roundToOneDecimal(1.24)).toBe(1.2);
    expect(roundToOneDecimal(1.25)).toBe(1.3);
    expect(roundToOneDecimal(1.26)).toBe(1.3);
  });

  it("tam sayıları değiştirmez", () => {
    expect(roundToOneDecimal(10)).toBe(10);
  });

  it("sıfırı doğru işler", () => {
    expect(roundToOneDecimal(0)).toBe(0);
  });
});
