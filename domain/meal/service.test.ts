import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateMealItem = vi.fn();
const mockFindByIdempotencyKey = vi.fn();

vi.mock("./repository", () => ({
  mealRepository: {
    createMealItem: (...args: unknown[]) => mockCreateMealItem(...args),
    findByIdempotencyKey: (...args: unknown[]) => mockFindByIdempotencyKey(...args),
    findMealItemForUser: vi.fn(),
    listMealItemsForUser: vi.fn(),
  },
}));

import { createMealItemForUser } from "./service";
import type { NutritionSourceOfTruth } from "@/domain/nutrition/contract";
import type { CalculatedNutrition } from "@/types/nutrition";

const fakeCalculatedNutrition: CalculatedNutrition = {
  energy_kcal: 111,
  protein_g: 22,
  carbohydrates_g: 33,
  fat_g: 4,
  fiber_g: 5,
};

function makeFakeNutritionSource(
  value: CalculatedNutrition = fakeCalculatedNutrition,
): NutritionSourceOfTruth {
  return { getCalculatedNutrition: vi.fn().mockResolvedValue(value) };
}

beforeEach(() => {
  mockCreateMealItem.mockReset();
  mockFindByIdempotencyKey.mockReset();
  mockFindByIdempotencyKey.mockResolvedValue(null);
  mockCreateMealItem.mockResolvedValue({ id: "item-1" });
});

describe("createMealItemForUser", () => {
  it("ADIM 16'nın döndürdüğü calculated_nutrition değerlerini DEĞİŞTİRMEDEN repository'ye iletir", async () => {
    const fakeSource = makeFakeNutritionSource();

    await createMealItemForUser(
      "user-1",
      { food_id: "food-1", consumed_weight_g: 150, meal_type: "BREAKFAST" },
      { nutritionSource: fakeSource },
    );

    expect(mockCreateMealItem).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        foodId: "food-1",
        consumedWeightG: 150,
        mealType: "BREAKFAST",
        calculatedNutrition: fakeCalculatedNutrition,
      }),
    );
  });

  it("her zaman kayıtları çağıran kullanıcının userId'siyle ilişkilendirir (user isolation)", async () => {
    await createMealItemForUser(
      "user-42",
      { food_id: "food-1", consumed_weight_g: 100, meal_type: "LUNCH" },
      { nutritionSource: makeFakeNutritionSource() },
    );

    expect(mockCreateMealItem).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-42" }),
    );
  });

  it("aynı idempotency_key için mevcut kaydı döner; yeniden hesaplama veya kayıt tetiklemez", async () => {
    const existing = { id: "existing-item" };
    mockFindByIdempotencyKey.mockResolvedValueOnce(existing);
    const getCalculatedNutrition = vi.fn();

    const result = await createMealItemForUser(
      "user-1",
      {
        food_id: "food-1",
        consumed_weight_g: 150,
        meal_type: "BREAKFAST",
        idempotency_key: "key-1",
      },
      { nutritionSource: { getCalculatedNutrition } },
    );

    expect(result).toBe(existing);
    expect(getCalculatedNutrition).not.toHaveBeenCalled();
    expect(mockCreateMealItem).not.toHaveBeenCalled();
  });
});
