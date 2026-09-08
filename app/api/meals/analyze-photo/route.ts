import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { photoAnalysisInputSchema } from "@/lib/validation/foodRecognition";
import { checkRateLimit } from "@/lib/rateLimit/simpleRateLimiter";
import { analyzeFoodPhoto } from "@/domain/nutrition/photoAnalysis";
import { FoodRecognitionNotImplementedError } from "@/domain/nutrition/foodRecognition";
import { createDeterministicMockSource } from "@/domain/nutrition/foodRecognitionMock";

/** ~8MB — base64 şişme faktörü (4/3) hesaba katılarak kontrol edilir. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * POST /api/meals/analyze-photo — bir yemek fotoğrafını analiz eder.
 *
 * KRİTİK: Bu uç nokta HİÇBİR MealItem OLUŞTURMAZ. Sonuç, kullanıcının
 * onaylayıp/düzelteceği GEÇİCİ bir öneridir — sunucu tarafında
 * SAKLANMAZ (stateless: istemci sonucu tutar, onayladığında normal
 * `POST /api/meals`'e MealItemInput olarak gönderir — bkz. o route,
 * DEĞİŞMEDİ). Onaylanmamış bir analiz sonucundan meal item oluşturmanın
 * hiçbir kod yolu yoktur.
 *
 * GÜVENLİK:
 *  - Kimlik doğrulama zorunlu (fail-closed, diğer route'larla aynı desen).
 *  - Kullanıcı başına basit rate limit (bkz. lib/rateLimit — tek-instance
 *    sınırlamasıyla, dokümante edilmiş).
 *  - Görsel boyutu/MIME tipi doğrulanır (aşırı büyük/yanlış tipte dosya
 *    reddedilir).
 *  - AI çıktısı zod ile doğrulanır (bkz. domain/nutrition/photoAnalysis.ts).
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();

    if (
      !checkRateLimit(
        `photo-analysis:${userId}`,
        RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_MS,
      )
    ) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = photoAnalysisInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const approxBytes = (parsed.data.image_base64.length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "image_too_large" }, { status: 413 });
    }

    // Yalnızca açıkça istenirse (geliştirme/deneme) deterministik mock
    // kullanılır — production varsayılanı DEĞİLDİR.
    const recognitionSource =
      process.env.AI_FOOD_RECOGNITION_MODE === "mock"
        ? createDeterministicMockSource(parsed.data)
        : undefined;

    const result = await analyzeFoodPhoto(parsed.data, { recognitionSource });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof FoodRecognitionNotImplementedError) {
      return NextResponse.json(
        { error: "ai_not_implemented", message: error.message },
        { status: 501 },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "ai_output_invalid", message: "AI sağlayıcısının yanıtı geçersiz/güvensiz." },
        { status: 502 },
      );
    }
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
