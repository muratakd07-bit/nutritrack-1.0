import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateFood = vi.fn();
const mockUpsertNutritionFacts = vi.fn();

vi.mock("./repository", () => ({
  foodsRepository: {
    createFood: (...args: unknown[]) => mockCreateFood(...args),
    upsertNutritionFacts: (...args: unknown[]) =>
      mockUpsertNutritionFacts(...args),
    // Gerçek transaction yok — callback'i doğrudan çalıştırır (testte
    // önemli olan atomiklik değil, createFood/upsertNutritionFacts'in
    // doğru argümanlarla çağrıldığıdır).
    runInTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}));

import { createVerifiedFood } from "./service";

const sampleFacts = {
  energy_kcal_per_100g: 165,
  protein_g_per_100g: 31,
  carbohydrates_g_per_100g: 0,
  fat_g_per_100g: 3.6,
  fiber_g_per_100g: 0,
};

beforeEach(() => {
  mockCreateFood.mockReset();
  mockUpsertNutritionFacts.mockReset();
  mockCreateFood.mockResolvedValue({ id: "food-1", name: "Test Food" });
});

describe("createVerifiedFood", () => {
  it("food oluşturur ve aynı id ile facts'i yazar", async () => {
    const food = await createVerifiedFood({
      name: "Test Food",
      facts: sampleFacts,
      source: "USDA_FDC",
      sourceRef: "12345",
    });

    expect(mockCreateFood).toHaveBeenCalledWith("Test Food", expect.anything());
    expect(mockUpsertNutritionFacts).toHaveBeenCalledWith(
      "food-1",
      sampleFacts,
      { source: "USDA_FDC", sourceRef: "12345" },
      expect.anything(),
    );
    expect(food).toEqual({ id: "food-1", name: "Test Food" });
  });

  it("facts değerlerini DEĞİŞTİRMEDEN repository'ye iletir", async () => {
    await createVerifiedFood({
      name: "Another Food",
      facts: sampleFacts,
      source: "MANUAL_VERIFIED",
    });

    const [, passedFacts] = mockUpsertNutritionFacts.mock.calls[0];
    expect(passedFacts).toEqual(sampleFacts);
  });
});
