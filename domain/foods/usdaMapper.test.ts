import { describe, expect, it } from "vitest";
import { mapUsdaFoodToVerifiedFood } from "./usdaMapper";
import type { UsdaFood } from "./usdaTypes";

/**
 * GERÇEK USDA FoodData Central kaydı — 2026-09-08'de canlı olarak
 * fdc.nal.usda.gov API'sinden çekildi (fdcId 331960). Bağımsız olarak
 * https://fdc.nal.usda.gov/food-details/331960/nutrients adresinden
 * doğrulanabilir. Yalnızca bu testte kullanılan alanlar dahil edilmiştir
 * (gerçek yanıt çok daha fazla mikro-besin içerir).
 */
const REAL_CHICKEN_BREAST_FIXTURE: UsdaFood = {
  fdcId: 331960,
  description:
    "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised",
  dataType: "Foundation",
  foodNutrients: [
    { nutrient: { id: 1008, number: "208", name: "Energy", unitName: "kcal" }, amount: 166 },
    { nutrient: { id: 1003, number: "203", name: "Protein", unitName: "g" }, amount: 32.1 },
    { nutrient: { id: 1004, number: "204", name: "Total lipid (fat)", unitName: "g" }, amount: 3.24 },
    { nutrient: { id: 1005, number: "205", name: "Carbohydrate, by difference", unitName: "g" }, amount: 0 },
    // Not: bu gerçek kayıtta fiber (291) hiç raporlanmamış — bkz. mapper'daki gerekçe.
  ],
};

describe("mapUsdaFoodToVerifiedFood — gerçek USDA verisiyle", () => {
  it("gerçek tavuk göğsü kaydını doğru eşler", () => {
    const result = mapUsdaFoodToVerifiedFood(REAL_CHICKEN_BREAST_FIXTURE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.food).toEqual({
      name: "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised",
      facts: {
        energy_kcal_per_100g: 166,
        protein_g_per_100g: 32.1,
        carbohydrates_g_per_100g: 0,
        fat_g_per_100g: 3.24,
        fiber_g_per_100g: 0,
      },
      sourceRef: "331960",
      sourceDataType: "Foundation",
    });
  });

  it("desteklenmeyen bir dataType (ör. Branded) mapping problem olarak işaretlenir, sessizce import edilmez", () => {
    const branded: UsdaFood = { ...REAL_CHICKEN_BREAST_FIXTURE, dataType: "Branded" };
    const result = mapUsdaFoodToVerifiedFood(branded);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.reason).toContain("Branded");
    }
  });

  it("raporlanmamış fiber'ı 0 kabul eder (mapping problem SAYMAZ)", () => {
    const result = mapUsdaFoodToVerifiedFood(REAL_CHICKEN_BREAST_FIXTURE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.food.facts.fiber_g_per_100g).toBe(0);
    }
  });

  it("fiber raporlanmışsa gerçek değeri kullanır", () => {
    const withFiber: UsdaFood = {
      ...REAL_CHICKEN_BREAST_FIXTURE,
      foodNutrients: [
        ...REAL_CHICKEN_BREAST_FIXTURE.foodNutrients,
        { nutrient: { id: 1079, number: "291", name: "Fiber, total dietary", unitName: "g" }, amount: 2.5 },
      ],
    };
    const result = mapUsdaFoodToVerifiedFood(withFiber);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.food.facts.fiber_g_per_100g).toBe(2.5);
    }
  });

  it("energy eksikse mapping problem olarak işaretler (0 varsaymaz)", () => {
    const missingEnergy: UsdaFood = {
      ...REAL_CHICKEN_BREAST_FIXTURE,
      foodNutrients: REAL_CHICKEN_BREAST_FIXTURE.foodNutrients.filter(
        (n) => n.nutrient.number !== "208",
      ),
    };
    const result = mapUsdaFoodToVerifiedFood(missingEnergy);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.fdcId).toBe(331960);
      expect(result.problem.reason).toContain("energy");
    }
  });

  it("protein VE fat eksikse ikisini de gerekçede listeler", () => {
    const missingBoth: UsdaFood = {
      ...REAL_CHICKEN_BREAST_FIXTURE,
      foodNutrients: REAL_CHICKEN_BREAST_FIXTURE.foodNutrients.filter(
        (n) => n.nutrient.number !== "203" && n.nutrient.number !== "204",
      ),
    };
    const result = mapUsdaFoodToVerifiedFood(missingBoth);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.reason).toContain("protein");
      expect(result.problem.reason).toContain("fat");
    }
  });

  it("fdcId'yi string olarak sourceRef'e koyar", () => {
    const result = mapUsdaFoodToVerifiedFood(REAL_CHICKEN_BREAST_FIXTURE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.food.sourceRef).toBe("331960");
      expect(typeof result.food.sourceRef).toBe("string");
    }
  });
});
