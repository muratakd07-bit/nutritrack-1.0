import type { UsdaFood } from "./usdaTypes";

const USDA_API_BASE = "https://api.nal.usda.gov/fdc/v1";

/**
 * ADIM 28: Dayanıklılık ayarları. Gerçekten gözlemlenen bir 429 (bkz.
 * domain/foods/README.md — DEMO_KEY paylaşılan rate limiti) ile test
 * edildi. Testlerde gerçek bekleme süresi olmadan doğrulamak için
 * vitest'in sahte zamanlayıcıları (`vi.useFakeTimers`) kullanılır — bkz.
 * usdaClient.test.ts.
 */
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15_000;

export class UsdaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UsdaApiError";
  }
}

/**
 * `USDA_FDC_API_KEY` ortam değişkeninin mevcut olup olmadığını YALNIZCA
 * boolean olarak bildirir — değerini asla döndürmez/loglamaz. CLI script'i
 * ve raporlama bunu kullanır (bkz. scripts/import-usda-foods.ts).
 */
export function hasRealUsdaApiKey(): boolean {
  return Boolean(process.env.USDA_FDC_API_KEY);
}

function getApiKey(): string {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) {
    // DEMO_KEY: USDA'nın resmi, kayıt gerektirmeyen genel anahtarı — çok
    // düşük ve PAYLAŞILAN bir rate limite sahiptir (bkz. .env.example).
    // Gerçek/ölçekli import için USDA_FDC_API_KEY ortam değişkeni set
    // edilmelidir (ücretsiz, https://api.data.gov/signup/).
    return "DEMO_KEY";
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    }
  }
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

/**
 * TÜM USDA isteklerinin GEÇTİĞİ tek nokta. İki farklı hata sınıfını
 * KESİN OLARAK ayırır:
 *
 *  - Ağ seviyesi hata (DNS/bağlantı/timeout — fetch'in kendisi bir
 *    TypeError/DOMException fırlatır, HTTP durum kodu YOKTUR) VE 5xx/429
 *    (geçici/sunucu tarafı): KONTROLLÜ, ÜSTEL geri çekilmeyle (exponential
 *    backoff) `MAX_RETRIES` kez yeniden denenir. 429 için USDA'nın
 *    `Retry-After` header'ı VARSA ona uyulur.
 *  - 4xx (429 HARİÇ — ör. 400 geçersiz istek, 403 geçersiz key): ASLA
 *    yeniden denenmez, hemen fırlatılır (yeniden denemek anlamsız/israf).
 *
 * ADIM 27'de gerçekten gözlemlenen bir hatayı (ağ seviyesi hatanın
 * sarmalanmadan `matchLabelToFoods`'un dışına, tüm fotoğraf analizi
 * isteğini çökertecek şekilde sızması) bir daha tekrarlamaz.
 */
async function fetchUsdaWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      lastNetworkError = error;
      if (attempt === MAX_RETRIES) {
        throw new UsdaApiError(
          `USDA FDC API'ye ağ seviyesinde ulaşılamadı (${MAX_RETRIES + 1} denemeden sonra): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      await sleep(backoffDelayMs(attempt, null));
      continue;
    }

    if (response.ok) return response;

    const isRetryable = response.status === 429 || response.status >= 500;
    if (!isRetryable || attempt === MAX_RETRIES) {
      return response; // 4xx (429 hariç) VEYA son deneme — çağıran taraf status'a göre karar versin
    }

    await sleep(backoffDelayMs(attempt, response.headers.get("retry-after")));
  }

  // Buraya asla ulaşılmamalı (döngü içindeki dallar hep return/throw eder) —
  // TypeScript'in kontrol akışı analizini tatmin etmek için.
  throw new UsdaApiError(
    `USDA FDC API'ye ulaşılamadı: ${
      lastNetworkError instanceof Error ? lastNetworkError.message : "bilinmeyen hata"
    }`,
  );
}

function usdaErrorFromResponse(response: Response, context: string): UsdaApiError {
  if (response.status === 429) {
    return new UsdaApiError(
      `USDA FDC API rate limit aşıldı (${MAX_RETRIES} yeniden deneme sonrası hâlâ 429) — ` +
        "DEMO_KEY kullanılıyorsa gerçek bir USDA_FDC_API_KEY ile deneyin.",
      429,
    );
  }
  return new UsdaApiError(`${context}: ${response.status} ${response.statusText}`, response.status);
}

/**
 * Birden fazla fdcId'yi TEK bir istekte çeker (rate limit'i korumak için
 * `/food/{id}` yerine bulk `/foods` uç noktası kullanılır).
 */
export async function getUsdaFoodsByIds(fdcIds: number[]): Promise<UsdaFood[]> {
  if (fdcIds.length === 0) return [];

  const apiKey = getApiKey();
  const response = await fetchUsdaWithRetry(`${USDA_API_BASE}/foods?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fdcIds }),
  });

  if (!response.ok) {
    throw usdaErrorFromResponse(response, "USDA FDC API hatası");
  }

  return response.json();
}

export async function searchUsdaFoods(
  query: string,
  dataType: string[] = ["Foundation", "SR Legacy"],
  pageSize = 25,
): Promise<{ fdcId: number; description: string }[]> {
  const apiKey = getApiKey();
  const response = await fetchUsdaWithRetry(`${USDA_API_BASE}/foods/search?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, dataType, pageSize }),
  });

  if (!response.ok) {
    throw usdaErrorFromResponse(response, "USDA FDC arama hatası");
  }

  const data = (await response.json()) as {
    foods: { fdcId: number; description: string }[];
  };
  return data.foods;
}

export interface UsdaFoodListItem {
  fdcId: number;
  description: string;
  dataType: string;
}

/**
 * USDA'nın `/foods/list` uç noktasıyla, bir arama sorgusu OLMADAN,
 * sayfa sayfa (pagination) besin listeler — toplu/keşif tabanlı import
 * için kullanılır (bkz. scripts/import-usda-foods.ts `--limit`).
 *
 * DÜRÜSTLÜK NOTU: Bu uç noktanın tam yanıt şekli, bu oturumda USDA'nın
 * DEMO_KEY paylaşılan rate limitine takılması nedeniyle CANLI olarak
 * yeniden doğrulanamadı (bkz. domain/foods/README.md — ADIM 26/27'de
 * defalarca gözlemlenen aynı kısıt). Uygulama, USDA'nın resmi, uzun
 * süredir kararlı dokümantasyonuna dayanır (`dataType`, `pageSize`,
 * `pageNumber` parametreleri; yanıt bir food özet dizisidir). Gerçek bir
 * çalıştırma (bu ADIM'ın sonundaki `--limit 10` denemesi) bunu ya
 * doğrular ya da başarısızlığı olduğu gibi raporlar — sessizce varsayılan
 * bir veri UYDURULMAZ.
 */
export async function listUsdaFoods(
  dataType: string[],
  pageSize: number,
  pageNumber: number,
): Promise<UsdaFoodListItem[]> {
  const apiKey = getApiKey();
  const response = await fetchUsdaWithRetry(`${USDA_API_BASE}/foods/list?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataType,
      pageSize,
      pageNumber,
      sortBy: "fdcId",
      sortOrder: "asc",
    }),
  });

  if (!response.ok) {
    throw usdaErrorFromResponse(response, "USDA FDC liste hatası");
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new UsdaApiError(
      "USDA FDC /foods/list beklenmeyen bir yanıt şekli döndürdü (dizi değil) — " +
        "yanıt şekli değişmiş olabilir, sessizce devam edilmedi.",
    );
  }

  return data.map((item) => {
    const record = item as Record<string, unknown>;
    if (
      typeof record.fdcId !== "number" ||
      typeof record.description !== "string" ||
      typeof record.dataType !== "string"
    ) {
      throw new UsdaApiError(
        "USDA FDC /foods/list bir öğede beklenen fdcId/description/dataType " +
          "alanlarını içermiyor — yanıt şekli değişmiş olabilir.",
      );
    }
    return {
      fdcId: record.fdcId,
      description: record.description,
      dataType: record.dataType,
    };
  });
}
