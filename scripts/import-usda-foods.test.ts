import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListUsdaFoods = vi.fn();

vi.mock("@/domain/foods/usdaClient", async () => {
  const actual = await vi.importActual<typeof import("@/domain/foods/usdaClient")>(
    "@/domain/foods/usdaClient",
  );
  return {
    ...actual,
    listUsdaFoods: (...args: unknown[]) => mockListUsdaFoods(...args),
  };
});

vi.mock("@/domain/foods/importUsdaFoods", () => ({
  importUsdaFoods: vi.fn(),
}));

import { discoverFdcIds, parseArgs } from "./import-usda-foods";

beforeEach(() => {
  mockListUsdaFoods.mockReset();
});

describe("parseArgs", () => {
  it("--limit ile keşif modunu ayrıştırır, varsayılan page-size uygular", () => {
    expect(parseArgs(["--limit", "100"])).toEqual({
      mode: "discovery",
      limit: 100,
      pageSize: 50,
    });
  });

  it("--limit ve --page-size'ı birlikte ayrıştırır", () => {
    expect(parseArgs(["--limit", "10", "--page-size", "5"])).toEqual({
      mode: "discovery",
      limit: 10,
      pageSize: 5,
    });
  });

  it("--page-size, MAX_PAGE_SIZE'ı (200) aşarsa sınırlanır", () => {
    const result = parseArgs(["--limit", "10", "--page-size", "9999"]);
    expect(result).toMatchObject({ mode: "discovery", pageSize: 200 });
  });

  it("geçersiz --limit (0, negatif, sayı değil) null döner", () => {
    expect(parseArgs(["--limit", "0"])).toBeNull();
    expect(parseArgs(["--limit", "-5"])).toBeNull();
    expect(parseArgs(["--limit", "abc"])).toBeNull();
  });

  it("açık fdcId listesini (geriye dönük uyumlu) ayrıştırır", () => {
    expect(parseArgs(["331960", "173410"])).toEqual({
      mode: "explicit",
      fdcIds: [331960, 173410],
    });
  });

  it("geçersiz sayılar açık fdcId listesinden filtrelenir", () => {
    expect(parseArgs(["331960", "abc", "-5", "0"])).toEqual({
      mode: "explicit",
      fdcIds: [331960],
    });
  });

  it("hiçbir geçerli fdcId yoksa (ve flag de yoksa) null döner", () => {
    expect(parseArgs([])).toBeNull();
    expect(parseArgs(["abc"])).toBeNull();
  });
});

describe("discoverFdcIds — pagination", () => {
  it("tek sayfa yeterliyse tek istek yapar", async () => {
    mockListUsdaFoods.mockResolvedValueOnce([
      { fdcId: 1, description: "A", dataType: "Foundation" },
      { fdcId: 2, description: "B", dataType: "Foundation" },
    ]);

    const result = await discoverFdcIds(2, 50);
    expect(result).toEqual([1, 2]);
    expect(mockListUsdaFoods).toHaveBeenCalledTimes(1);
    expect(mockListUsdaFoods).toHaveBeenCalledWith(
      ["Foundation", "SR Legacy"],
      50,
      1,
    );
  });

  it("limit tek sayfadan büyükse birden fazla sayfa çeker", async () => {
    mockListUsdaFoods
      .mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, i) => ({
          fdcId: i + 1,
          description: `F${i + 1}`,
          dataType: "Foundation",
        })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, i) => ({
          fdcId: i + 6,
          description: `F${i + 6}`,
          dataType: "SR Legacy",
        })),
      );

    const result = await discoverFdcIds(8, 5);
    expect(result).toHaveLength(8);
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(mockListUsdaFoods).toHaveBeenCalledTimes(2);
    expect(mockListUsdaFoods).toHaveBeenNthCalledWith(2, ["Foundation", "SR Legacy"], 5, 2);
  });

  it("bir sayfa pageSize'dan azsa (veri seti tükendi) daha fazla sayfa istemez", async () => {
    mockListUsdaFoods.mockResolvedValueOnce([
      { fdcId: 1, description: "A", dataType: "Foundation" },
    ]); // 1 < pageSize(50) -> son sayfa

    const result = await discoverFdcIds(100, 50);
    expect(result).toEqual([1]);
    expect(mockListUsdaFoods).toHaveBeenCalledTimes(1);
  });

  it("boş bir sayfa gelirse döngüyü durdurur", async () => {
    mockListUsdaFoods.mockResolvedValueOnce([]);
    const result = await discoverFdcIds(10, 50);
    expect(result).toEqual([]);
  });

  it("aynı limit/pageSize ile İKİNCİ çağrı AYNI ilk N kaydı verir (resume'un dayandığı determinizm)", async () => {
    const page = Array.from({ length: 3 }, (_, i) => ({
      fdcId: i + 1,
      description: `F${i + 1}`,
      dataType: "Foundation",
    }));
    mockListUsdaFoods.mockResolvedValue(page);

    const first = await discoverFdcIds(3, 50);
    const second = await discoverFdcIds(3, 50);
    expect(first).toEqual(second);
  });
});
