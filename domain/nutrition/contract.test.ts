import { describe, expect, it } from "vitest";
import {
  nutritionSourceOfTruth,
  NutritionSourceNotImplementedError,
} from "./contract";

describe("nutritionSourceOfTruth (varsayılan/production implementasyon)", () => {
  it("ADIM 16 henüz bağlanmadığı için NotImplementedError fırlatır (uydurma değer DÖNMEZ)", async () => {
    await expect(
      nutritionSourceOfTruth.getCalculatedNutrition({
        food_id: "food-123",
        consumed_weight_g: 100,
        meal_type: "BREAKFAST",
      }),
    ).rejects.toThrow(NutritionSourceNotImplementedError);
  });
});
