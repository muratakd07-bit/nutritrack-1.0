import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFoodNutritionFacts = vi.fn();

vi.mock("./repository", () => ({
  nutritionRepository: {
    getFoodNutritionFacts: (...args: unknown[]) =>
      mockGetFoodNutritionFacts(...args),
  },
}));

import {
  nutritionSourceOfTruth,
  FoodNutritionFactsNotFoundError,
} from "./contract";

beforeEach(() => {
  mockGetFoodNutritionFacts.mockReset();
});

describe("nutritionSourceOfTruth (gerçek implementasyon)", () => {
  it("facts bulunamazsa FoodNutritionFactsNotFoundError fırlatır (uydurma değer DÖNMEZ)", async () => {
    mockGetFoodNutritionFacts.mockResolvedValue(null);

    await expect(
      nutritionSourceOfTruth.getCalculatedNutrition({
        food_id: "unknown-food",
        consumed_weight_g: 100,
        meal_type: "BREAKFAST",
      }),
    ).rejects.toThrow(FoodNutritionFactsNotFoundError);
  });

  it("facts bulunursa consumed_weight_g'ye doğru ölçeklenmiş sonucu döner", async () => {
    mockGetFoodNutritionFacts.mockResolvedValue({
      energy_kcal_per_100g: 200,
      protein_g_per_100g: 20,
      carbohydrates_g_per_100g: 30,
      fat_g_per_100g: 10,
      fiber_g_per_100g: 4,
    });

    const result = await nutritionSourceOfTruth.getCalculatedNutrition({
      food_id: "known-food",
      consumed_weight_g: 50,
      meal_type: "LUNCH",
    });

    expect(result).toEqual({
      energy_kcal: 100,
      protein_g: 10,
      carbohydrates_g: 15,
      fat_g: 5,
      fiber_g: 2,
    });
  });

  it("doğru food_id ile repository'yi çağırır", async () => {
    mockGetFoodNutritionFacts.mockResolvedValue({
      energy_kcal_per_100g: 100,
      protein_g_per_100g: 10,
      carbohydrates_g_per_100g: 10,
      fat_g_per_100g: 10,
      fiber_g_per_100g: 10,
    });

    await nutritionSourceOfTruth.getCalculatedNutrition({
      food_id: "food-xyz",
      consumed_weight_g: 100,
      meal_type: "DINNER",
    });

    expect(mockGetFoodNutritionFacts).toHaveBeenCalledWith("food-xyz");
  });
});
