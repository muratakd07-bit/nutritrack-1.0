import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UsdaFood } from "./usdaTypes";

const mockFindFactsBySourceRef = vi.fn();
const mockCreateFood = vi.fn();
const mockUpsertNutritionFacts = vi.fn();
const mockCreateImportRun = vi.fn();
const mockRunInTransaction = vi.fn();

vi.mock("./repository", () => ({
  foodsRepository: {
    findFactsBySourceRef: (...args: unknown[]) =>
      mockFindFactsBySourceRef(...args),
    createFood: (...args: unknown[]) => mockCreateFood(...args),
    upsertNutritionFacts: (...args: unknown[]) =>
      mockUpsertNutritionFacts(...args),
    createImportRun: (...args: unknown[]) => mockCreateImportRun(...args),
    runInTransaction: (...args: unknown[]) => mockRunInTransaction(...args),
  },
}));

import { importUsdaFoods, USDA_SOURCE } from "./importUsdaFoods";

function makeFood(fdcId: number, description: string): UsdaFood {
  return {
    fdcId,
    description,
    dataType: "Foundation",
    foodNutrients: [
      { nutrient: { id: 1008, number: "208", name: "Energy", unitName: "kcal" }, amount: 100 },
      { nutrient: { id: 1003, number: "203", name: "Protein", unitName: "g" }, amount: 10 },
      { nutrient: { id: 1004, number: "204", name: "Total lipid (fat)", unitName: "g" }, amount: 5 },
      { nutrient: { id: 1005, number: "205", name: "Carbohydrate, by difference", unitName: "g" }, amount: 20 },
    ],
  };
}

function makeIncompleteFood(fdcId: number, description: string): UsdaFood {
  return {
    fdcId,
    description,
    dataType: "Foundation",
    foodNutrients: [
      { nutrient: { id: 1008, number: "208", name: "Energy", unitName: "kcal" }, amount: 100 },
      // protein/fat/carbohydrate eksik -> mapping error
    ],
  };
}

beforeEach(() => {
  mockFindFactsBySourceRef.mockReset();
  mockCreateFood.mockReset();
  mockUpsertNutritionFacts.mockReset();
  mockCreateImportRun.mockReset();
  mockRunInTransaction.mockReset();

  // runInTransaction: verilen fonksiyonu doğrudan çalıştır (gerçek tx yok, testte önemli değil).
  mockRunInTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({}));
  mockFindFactsBySourceRef.mockResolvedValue(null);
  mockCreateFood.mockImplementation(async (name: string) => ({ id: `food-${name}`, name }));
  mockUpsertNutritionFacts.mockResolvedValue({});
  mockCreateImportRun.mockImplementation(async (params: unknown) => ({
    id: "run-1",
    ...(params as object),
  }));
});

describe("importUsdaFoods", () => {
  it("yeni bir food'u import eder", async () => {
    const food = makeFood(111, "Test Food A");
    const summary = await importUsdaFoods([111], [food]);

    expect(summary.importedCount).toBe(1);
    expect(summary.duplicateCount).toBe(0);
    expect(summary.mappingErrorCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
    expect(mockCreateFood).toHaveBeenCalledWith("Test Food A", expect.anything());
  });

  it("idempotent: (source, sourceRef) zaten varsa YENİDEN YAZMAZ, duplicate sayar", async () => {
    mockFindFactsBySourceRef.mockResolvedValue({ foodId: "existing-food-id" });

    const food = makeFood(222, "Already Imported Food");
    const summary = await importUsdaFoods([222], [food]);

    expect(summary.duplicateCount).toBe(1);
    expect(summary.importedCount).toBe(0);
    expect(mockCreateFood).not.toHaveBeenCalled();
    expect(mockUpsertNutritionFacts).not.toHaveBeenCalled();
  });

  it("her zaman USDA_FDC source'u ile arar — başka bir source'a asla dokunmaz", async () => {
    const food = makeFood(333, "Test Food");
    await importUsdaFoods([333], [food]);

    expect(mockFindFactsBySourceRef).toHaveBeenCalledWith(
      USDA_SOURCE,
      "333",
      expect.anything(),
    );
  });

  it("eksik temel makrolu bir food'u mapping_error olarak sayar, DB'ye yazmaz", async () => {
    const food = makeIncompleteFood(444, "Incomplete Food");
    const summary = await importUsdaFoods([444], [food]);

    expect(summary.mappingErrorCount).toBe(1);
    expect(summary.importedCount).toBe(0);
    expect(mockCreateFood).not.toHaveBeenCalled();
  });

  it("USDA yanıtında bulunmayan bir fdcId'yi skipped olarak sayar", async () => {
    const summary = await importUsdaFoods([555, 666], [makeFood(555, "Found Food")]);

    expect(summary.requestedCount).toBe(2);
    expect(summary.importedCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    const skipped = summary.details.find((d) => d.fdcId === 666);
    expect(skipped?.outcome).toBe("skipped");
  });

  it("karma bir batch'te tüm sayaçları doğru toplar", async () => {
    mockFindFactsBySourceRef.mockImplementation(async (_source, sourceRef) =>
      sourceRef === "20" ? { foodId: "dup-food" } : null,
    );

    const foods = [
      makeFood(10, "Imported 1"),
      makeFood(20, "Duplicate 1"),
      makeIncompleteFood(30, "Mapping Error 1"),
    ];
    // 40 istenen ama fetchedFoods'ta yok -> skipped
    const summary = await importUsdaFoods([10, 20, 30, 40], foods);

    expect(summary.requestedCount).toBe(4);
    expect(summary.importedCount).toBe(1);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.mappingErrorCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
  });

  it("her çalışma sonunda bir FoodImportRun audit kaydı oluşturur", async () => {
    const food = makeFood(777, "Audited Food");
    const summary = await importUsdaFoods([777], [food]);

    expect(mockCreateImportRun).toHaveBeenCalledWith(
      expect.objectContaining({
        source: USDA_SOURCE,
        requestedCount: 1,
        importedCount: 1,
      }),
    );
    expect(summary.runId).toBe("run-1");
  });

  it("21 food'luk bir isteği birden fazla transaction/batch'e böler", async () => {
    const foods = Array.from({ length: 21 }, (_, i) => makeFood(1000 + i, `Food ${i}`));
    const ids = foods.map((f) => f.fdcId);

    await importUsdaFoods(ids, foods);

    // BATCH_SIZE=20 -> 21 kayıt = 2 transaction çağrısı (20 + 1).
    expect(mockRunInTransaction).toHaveBeenCalledTimes(2);
  });
});
