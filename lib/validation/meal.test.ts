import { describe, expect, it } from "vitest";
import { mealItemInputSchema } from "./meal";

describe("mealItemInputSchema", () => {
  it("geçerli bir girdiyi kabul eder", () => {
    const result = mealItemInputSchema.safeParse({
      food_id: "food-123",
      consumed_weight_g: 150,
      meal_type: "BREAKFAST",
    });
    expect(result.success).toBe(true);
  });

  it("boş food_id'yi reddeder", () => {
    const result = mealItemInputSchema.safeParse({
      food_id: "",
      consumed_weight_g: 150,
      meal_type: "BREAKFAST",
    });
    expect(result.success).toBe(false);
  });

  it("negatif consumed_weight_g'yi reddeder", () => {
    const result = mealItemInputSchema.safeParse({
      food_id: "food-123",
      consumed_weight_g: -10,
      meal_type: "BREAKFAST",
    });
    expect(result.success).toBe(false);
  });

  it("sıfır consumed_weight_g'yi reddeder", () => {
    const result = mealItemInputSchema.safeParse({
      food_id: "food-123",
      consumed_weight_g: 0,
      meal_type: "BREAKFAST",
    });
    expect(result.success).toBe(false);
  });

  it("gerçekçi olmayan büyüklükte consumed_weight_g'yi reddeder", () => {
    const result = mealItemInputSchema.safeParse({
      food_id: "food-123",
      consumed_weight_g: 999999,
      meal_type: "BREAKFAST",
    });
    expect(result.success).toBe(false);
  });

  it("geçersiz meal_type'ı reddeder", () => {
    const result = mealItemInputSchema.safeParse({
      food_id: "food-123",
      consumed_weight_g: 150,
      meal_type: "BRUNCH",
    });
    expect(result.success).toBe(false);
  });

  it("opsiyonel idempotency_key olmadan da geçerlidir", () => {
    const result = mealItemInputSchema.safeParse({
      food_id: "food-123",
      consumed_weight_g: 150,
      meal_type: "SNACK",
    });
    expect(result.success).toBe(true);
  });
});
