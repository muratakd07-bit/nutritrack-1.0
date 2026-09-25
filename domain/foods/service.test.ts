import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateFood = vi.fn();
const mockUpsertNutritionFacts = vi.fn();
const mockSearchWithFactsByName = vi.fn();

vi.mock("./repository", () => ({
  foodsRepository: {
    createFood: (...args: unknown[]) => mockCreateFood(...args),
    upsertNutritionFacts: (...args: unknown[]) =>
      mockUpsertNutritionFacts(...args),
    // Gerçek transaction yok — callback'i doğrudan çalıştırır (testte
    // önemli olan atomiklik değil, createFood/upsertNutritionFacts'in
    // doğru argümanlarla çağrıldığıdır).
    searchWithFactsByName: (...args: unknown[]) =>
      mockSearchWithFactsByName(...args),
    runInTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}));

import { createVerifiedFood, searchFoods } from "./service";

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

describe("searchFoods", () => {
  beforeEach(() => mockSearchWithFactsByName.mockReset());

  it("sorguyu kelimelere böler ve DB'deki 100g değerlerini olduğu gibi döner", async () => {
    mockSearchWithFactsByName.mockResolvedValue([
      {
        id: "food-1",
        name: "Rice, white, cooked",
        nutritionFacts: {
          energyKcalPer100g: 130,
          proteinGPer100g: 2.7,
          carbohydratesGPer100g: 28,
          fatGPer100g: 0.3,
          fiberGPer100g: 0.4,
          source: "USDA_FDC",
        },
      },
    ]);

    const result = await searchFoods("  Rice   cooked ");

    expect(mockSearchWithFactsByName).toHaveBeenCalledWith(["rice", "cooked"], 20);
    expect(result).toEqual([
      {
        food_id: "food-1",
        name: "Rice, white, cooked",
        per_100g: {
          energy_kcal_per_100g: 130,
          protein_g_per_100g: 2.7,
          carbohydrates_g_per_100g: 28,
          fat_g_per_100g: 0.3,
          fiber_g_per_100g: 0.4,
        },
        source: "USDA_FDC",
      },
    ]);
  });

  it("yaygın Türkçe kelimeleri İngilizce karşılığıyla arar", async () => {
    mockSearchWithFactsByName.mockResolvedValue([]);
    await searchFoods("Pirinç");
    expect(mockSearchWithFactsByName).toHaveBeenCalledWith(["rice"], 20);
  });

  it("en fazla 5 kelimeyle arar", async () => {
    mockSearchWithFactsByName.mockResolvedValue([]);
    await searchFoods("a b c d e f g");
    expect(mockSearchWithFactsByName.mock.calls[0][0]).toHaveLength(5);
  });
});
