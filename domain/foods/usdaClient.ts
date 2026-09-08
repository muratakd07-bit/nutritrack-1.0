import type { UsdaFood } from "./usdaTypes";

const USDA_API_BASE = "https://api.nal.usda.gov/fdc/v1";

export class UsdaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UsdaApiError";
  }
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

/**
 * Birden fazla fdcId'yi TEK bir istekte çeker (rate limit'i korumak için
 * `/food/{id}` yerine bulk `/foods` uç noktası kullanılır).
 */
export async function getUsdaFoodsByIds(fdcIds: number[]): Promise<UsdaFood[]> {
  if (fdcIds.length === 0) return [];

  const apiKey = getApiKey();
  const response = await fetch(`${USDA_API_BASE}/foods?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fdcIds }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new UsdaApiError(
        "USDA FDC API rate limit aşıldı (DEMO_KEY kullanılıyorsa gerçek bir " +
          "USDA_FDC_API_KEY ile deneyin).",
        429,
      );
    }
    throw new UsdaApiError(
      `USDA FDC API hatası: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return response.json();
}

export async function searchUsdaFoods(
  query: string,
  dataType: string[] = ["Foundation", "SR Legacy"],
  pageSize = 25,
): Promise<{ fdcId: number; description: string }[]> {
  const apiKey = getApiKey();
  const response = await fetch(`${USDA_API_BASE}/foods/search?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, dataType, pageSize }),
  });

  if (!response.ok) {
    throw new UsdaApiError(
      `USDA FDC arama hatası: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    foods: { fdcId: number; description: string }[];
  };
  return data.foods;
}
