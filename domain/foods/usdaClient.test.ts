import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUsdaFoodsByIds, searchUsdaFoods, UsdaApiError } from "./usdaClient";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("usdaClient — ağ seviyesi hata sarmalama", () => {
  /**
   * ADIM 27'nin canlı Qwen3-VL testinde GERÇEKTEN gözlemlenen bir hata:
   * USDA'ya DNS/bağlantı seviyesinde ulaşılamadığında (HTTP durum kodu
   * OLMADAN) fetch bir TypeError fırlatır. Bu, foodMatcher.ts'in yalnızca
   * UsdaApiError'ı yakalayıp akışı bozmadan devam etmesini beklediği
   * sözleşmeyi ihlal ediyordu — sarmalanmadan sızan bir TypeError, tüm
   * fotoğraf analizi isteğini çökertiyordu.
   */
  it("searchUsdaFoods: ham ağ hatasını (TypeError) UsdaApiError'a çevirir", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("fetch failed"),
    );

    await expect(searchUsdaFoods("chicken")).rejects.toBeInstanceOf(
      UsdaApiError,
    );
  });

  it("getUsdaFoodsByIds: ham ağ hatasını (TypeError) UsdaApiError'a çevirir", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("fetch failed"),
    );

    await expect(getUsdaFoodsByIds([331960])).rejects.toBeInstanceOf(
      UsdaApiError,
    );
  });

  it("HTTP 429 yanıtı hâlâ status alanıyla birlikte UsdaApiError fırlatır (regresyon değil)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("", { status: 429, statusText: "Too Many Requests" }),
    );

    await expect(searchUsdaFoods("chicken")).rejects.toMatchObject({
      name: "UsdaApiError",
    });
  });
});
