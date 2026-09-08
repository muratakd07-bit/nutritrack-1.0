import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearchByNameWords = vi.fn();
const mockFindById = vi.fn();
const mockFindFactsBySourceRef = vi.fn();
const mockSearchUsdaFoods = vi.fn();
const mockGetUsdaFoodsByIds = vi.fn();
const mockImportUsdaFoods = vi.fn();

vi.mock("./repository", () => ({
  foodsRepository: {
    searchByNameWords: (...args: unknown[]) => mockSearchByNameWords(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    findFactsBySourceRef: (...args: unknown[]) =>
      mockFindFactsBySourceRef(...args),
  },
}));

vi.mock("./usdaClient", async () => {
  const actual = await vi.importActual<typeof import("./usdaClient")>(
    "./usdaClient",
  );
  return {
    ...actual,
    searchUsdaFoods: (...args: unknown[]) => mockSearchUsdaFoods(...args),
    getUsdaFoodsByIds: (...args: unknown[]) => mockGetUsdaFoodsByIds(...args),
  };
});

vi.mock("./importUsdaFoods", () => ({
  USDA_SOURCE: "USDA_FDC",
  importUsdaFoods: (...args: unknown[]) => mockImportUsdaFoods(...args),
}));

import { matchLabelToFoods } from "./foodMatcher";
import { UsdaApiError } from "./usdaClient";

beforeEach(() => {
  mockSearchByNameWords.mockReset();
  mockFindById.mockReset();
  mockFindFactsBySourceRef.mockReset();
  mockSearchUsdaFoods.mockReset();
  mockGetUsdaFoodsByIds.mockReset();
  mockImportUsdaFoods.mockReset();
});

describe("matchLabelToFoods", () => {
  it("yerelde eşleşme varsa USDA'ya hiç istek atmaz", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "food-1", name: "Chicken, broiler or fryers, breast, cooked" },
    ]);

    const result = await matchLabelToFoods("grilled chicken breast");

    expect(result).toHaveLength(1);
    expect(result[0].match_source).toBe("LOCAL");
    expect(result[0].food_id).toBe("food-1");
    expect(mockSearchUsdaFoods).not.toHaveBeenCalled();
  });

  it("kelime eşleşme sayısına göre skorlayıp sıralar", async () => {
    mockSearchByNameWords.mockResolvedValue([
      { id: "partial", name: "Chicken soup" }, // yalnızca "chicken" eşleşir
      { id: "full", name: "Grilled chicken breast fillet" }, // "grilled"+"chicken"+"breast" eşleşir
    ]);

    const result = await matchLabelToFoods("grilled chicken breast");

    expect(result[0].food_id).toBe("full");
    expect(result[0].match_score).toBeGreaterThan(result[1].match_score);
  });

  it("anlamlı kelime yoksa (çok kısa/stopword) boş dizi döner, hiç sorgu yapmaz", async () => {
    const result = await matchLabelToFoods("of the a");
    expect(result).toEqual([]);
    expect(mockSearchByNameWords).not.toHaveBeenCalled();
  });

  it("yerelde eşleşme yoksa USDA fallback dener ve yeni food'u import eder", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([
      { fdcId: 999, description: "Broccoli, raw" },
    ]);
    mockFindFactsBySourceRef.mockResolvedValueOnce(null); // henüz import edilmemiş
    mockGetUsdaFoodsByIds.mockResolvedValue([{ fdcId: 999, description: "Broccoli, raw", foodNutrients: [] }]);
    mockImportUsdaFoods.mockResolvedValue({ importedCount: 1 });
    mockFindFactsBySourceRef.mockResolvedValueOnce({ foodId: "new-food-id" }); // import sonrası
    mockFindById.mockResolvedValue({ id: "new-food-id", name: "Broccoli, raw" });

    const result = await matchLabelToFoods("broccoli");

    expect(mockImportUsdaFoods).toHaveBeenCalledWith([999], expect.anything());
    expect(result).toEqual([
      {
        food_id: "new-food-id",
        name: "Broccoli, raw",
        match_source: "USDA_FDC",
        match_score: 0.5,
      },
    ]);
  });

  it("USDA'da zaten import edilmiş bir food varsa TEKRAR import etmez", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([
      { fdcId: 331960, description: "Chicken breast" },
    ]);
    mockFindFactsBySourceRef.mockResolvedValue({ foodId: "existing-food-id" });
    mockFindById.mockResolvedValue({ id: "existing-food-id", name: "Chicken breast" });

    const result = await matchLabelToFoods("chicken breast");

    expect(mockImportUsdaFoods).not.toHaveBeenCalled();
    expect(result[0].food_id).toBe("existing-food-id");
  });

  it("USDA rate limit hatasında ÇÖKMEZ, boş sonuç döner", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockRejectedValue(new UsdaApiError("rate limited", 429));

    const result = await matchLabelToFoods("some unknown food");

    expect(result).toEqual([]);
  });

  it("USDA'da hiç sonuç yoksa boş dizi döner", async () => {
    mockSearchByNameWords.mockResolvedValue([]);
    mockSearchUsdaFoods.mockResolvedValue([]);

    const result = await matchLabelToFoods("nonexistent food xyz");

    expect(result).toEqual([]);
    expect(mockImportUsdaFoods).not.toHaveBeenCalled();
  });
});
