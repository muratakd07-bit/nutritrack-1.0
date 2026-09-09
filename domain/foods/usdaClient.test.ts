import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getUsdaFoodsByIds,
  hasRealUsdaApiKey,
  listUsdaFoods,
  searchUsdaFoods,
  UsdaApiError,
} from "./usdaClient";

const originalFetch = global.fetch;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  global.fetch = vi.fn();
  vi.useFakeTimers();
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Sahte zamanlayıcılarla, bekleyen tüm backoff gecikmelerini anında ilerletir. */
async function runWithFakeBackoff<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(60_000);
  return promise;
}

describe("hasRealUsdaApiKey — boolean-only, değer asla dönmez", () => {
  it("USDA_FDC_API_KEY tanımlıysa true döner", () => {
    process.env.USDA_FDC_API_KEY = "some-real-key";
    expect(hasRealUsdaApiKey()).toBe(true);
  });

  it("USDA_FDC_API_KEY tanımlı değilse false döner (DEMO_KEY kullanılacak demektir)", () => {
    delete process.env.USDA_FDC_API_KEY;
    expect(hasRealUsdaApiKey()).toBe(false);
  });
});

describe("usdaClient — ağ seviyesi hata sarmalama ve retry", () => {
  /**
   * ADIM 27'nin canlı Qwen3-VL testinde GERÇEKTEN gözlemlenen bir hata:
   * USDA'ya DNS/bağlantı seviyesinde ulaşılamadığında (HTTP durum kodu
   * OLMADAN) fetch bir TypeError fırlatır. Bu, foodMatcher.ts'in yalnızca
   * UsdaApiError'ı yakalayıp akışı bozmadan devam etmesini beklediği
   * sözleşmeyi ihlal ediyordu.
   */
  it("searchUsdaFoods: kalıcı ağ hatasında (TypeError) MAX_RETRIES kez dener, sonra UsdaApiError fırlatır", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("fetch failed"),
    );

    // ÖNEMLİ: reddi (rejection) zamanlayıcıları ilerletmeden ÖNCE "ele
    // alınmış" işaretlemek için expect(...).rejects burada senkron
    // olarak zincirlenir — aksi halde vitest'in sahte zamanlayıcılarıyla
    // "unhandled rejection" uyarısı üretir (davranışı etkilemez, ama
    // test çıktısını kirletir).
    const assertion = expect(searchUsdaFoods("chicken")).rejects.toBeInstanceOf(
      UsdaApiError,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(global.fetch).toHaveBeenCalledTimes(5); // ilk deneme + 4 retry
  });

  it("getUsdaFoodsByIds: kalıcı ağ hatasında (TypeError) UsdaApiError'a çevirir", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("fetch failed"),
    );

    const assertion = expect(getUsdaFoodsByIds([331960])).rejects.toBeInstanceOf(
      UsdaApiError,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it("geçici bir ağ hatasından SONRA başarılı olursa sonucu döner (network retry başarılı)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ foods: [{ fdcId: 1, description: "Test" }] })),
      );

    const promise = searchUsdaFoods("chicken");
    const result = await runWithFakeBackoff(promise);
    expect(result).toEqual([{ fdcId: 1, description: "Test" }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("HTTP 429: kontrollü backoff ile MAX_RETRIES kez dener, hepsi başarısızsa status=429 ile UsdaApiError fırlatır", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("", { status: 429, statusText: "Too Many Requests" }),
    );

    const assertion = expect(searchUsdaFoods("chicken")).rejects.toMatchObject({
      name: "UsdaApiError",
      status: 429,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it("HTTP 429 sonrası retry başarılı olursa sonucu döner", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ foods: [{ fdcId: 2, description: "Rice" }] })),
      );

    const promise = searchUsdaFoods("rice");
    const result = await runWithFakeBackoff(promise);
    expect(result).toEqual([{ fdcId: 2, description: "Rice" }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("429 yanıtında Retry-After header'ı VARSA ona uyar (sabit exponential yerine)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ foods: [] })),
      );

    const promise = searchUsdaFoods("chicken");
    // Retry-After: 2 saniye + biraz pay.
    await vi.advanceTimersByTimeAsync(2_500);
    const result = await promise;
    expect(result).toEqual([]);
  });

  it("HTTP 500 (5xx) sunucu hatasında da yeniden dener", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ foods: [] })));

    const promise = searchUsdaFoods("chicken");
    const result = await runWithFakeBackoff(promise);
    expect(result).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("HTTP 400 (4xx, 429 HARİÇ) ASLA yeniden denenmez", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("bad request", { status: 400, statusText: "Bad Request" }),
    );

    await expect(searchUsdaFoods("chicken")).rejects.toMatchObject({
      name: "UsdaApiError",
      status: 400,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("HTTP 403 (geçersiz/eksik key) de yeniden denenmez", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );

    await expect(getUsdaFoodsByIds([1])).rejects.toMatchObject({ status: 403 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("listUsdaFoods — sayfalama (pagination) tabanlı keşif", () => {
  it("dataType/pageSize/pageNumber'ı doğru gönderir ve sonucu ayrıştırır", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify([
          { fdcId: 1, description: "Rice, white, raw", dataType: "SR Legacy" },
          { fdcId: 2, description: "Chicken breast", dataType: "Foundation" },
        ]),
      ),
    );

    const result = await listUsdaFoods(["Foundation", "SR Legacy"], 50, 2);

    expect(result).toEqual([
      { fdcId: 1, description: "Rice, white, raw", dataType: "SR Legacy" },
      { fdcId: 2, description: "Chicken breast", dataType: "Foundation" },
    ]);

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/foods/list");
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({
      dataType: ["Foundation", "SR Legacy"],
      pageSize: 50,
      pageNumber: 2,
    });
  });

  it("API key'i URL'de gönderir ama asla loglamaz/response'a karıştırmaz — bu test yalnızca key'in body'ye SIZMADIĞINI doğrular", async () => {
    process.env.USDA_FDC_API_KEY = "test-key-not-real";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify([])));

    await listUsdaFoods(["Foundation"], 10, 1);

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((options as RequestInit).body as string).not.toContain("test-key-not-real");
  });

  it("beklenmeyen (dizi olmayan) yanıt şeklinde UsdaApiError fırlatır, sessizce yanlış ayrıştırmaz", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: "unexpected shape" })),
    );

    await expect(listUsdaFoods(["Foundation"], 10, 1)).rejects.toBeInstanceOf(UsdaApiError);
  });

  it("bir öğede fdcId/description/dataType eksikse UsdaApiError fırlatır (malformed response)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify([{ fdcId: 1 }])),
    );

    await expect(listUsdaFoods(["Foundation"], 10, 1)).rejects.toBeInstanceOf(UsdaApiError);
  });

  it("429'da diğer fonksiyonlarla AYNI retry davranışını gösterir", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([])));

    const promise = listUsdaFoods(["Foundation"], 10, 1);
    const result = await runWithFakeBackoff(promise);
    expect(result).toEqual([]);
  });
});
