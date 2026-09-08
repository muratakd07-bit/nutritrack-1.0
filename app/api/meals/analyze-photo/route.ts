import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  photoAnalysisInputSchema,
} from "@/lib/validation/foodRecognition";
import { checkRateLimit } from "@/lib/rateLimit/simpleRateLimiter";
import { analyzeFoodPhoto } from "@/domain/nutrition/photoAnalysis";
import { FoodRecognitionNotImplementedError } from "@/domain/nutrition/foodRecognition";
import { createDeterministicMockSource } from "@/domain/nutrition/foodRecognitionMock";
import { createSupabaseServerClient } from "@/lib/auth/supabaseServerClient";
import {
  downloadMealPhotoAsBase64,
  isOwnedPath,
  MealPhotoAccessError,
} from "@/lib/storage/mealPhotos";

/** Storage bucket'ındaki (allowed_mime_types) limitle aynı — bkz. supabase/storage-setup.sql. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * POST /api/meals/analyze-photo — bir yemek fotoğrafını analiz eder.
 *
 * ADIM 27 (Storage): İstemci fotoğrafı ÖNCE kendi private Storage
 * klasörüne (`{userId}/...`, bkz. supabase/storage-setup.sql) yükler,
 * sonra bu uç noktaya yalnızca `storage_path` referansını gönderir —
 * büyük bir base64 payload'u DOĞRUDAN bu isteğe koymaz. Gerçek indirme,
 * ÇAĞIRANIN kendi oturumuna bağlı (RLS'ye tabi) bir Supabase client'ıyla
 * yapılır — bir kullanıcı başka bir kullanıcının fotoğrafını path'i
 * tahmin etse bile indiremez (RLS + ek `isOwnedPath` ön kontrolü).
 *
 * KRİTİK: Bu uç nokta HİÇBİR MealItem OLUŞTURMAZ. Sonuç, kullanıcının
 * onaylayıp/düzelteceği GEÇİCİ bir öneridir — sunucu tarafında
 * SAKLANMAZ. Onaylanmamış bir analiz sonucundan meal item oluşturmanın
 * hiçbir kod yolu yoktur (bkz. domain/nutrition/README.md).
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

    const { storage_path: storagePath } = parsed.data;

    // Hızlı ön kontrol (RLS zaten aynı şeyi garanti eder — bu, gereksiz bir
    // Storage isteği yapmadan net bir 403 dönebilmek için).
    if (!isOwnedPath(storagePath, userId)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    let photo: { base64: string; mimeType: string };
    try {
      photo = await downloadMealPhotoAsBase64(supabase, storagePath);
    } catch (error) {
      if (error instanceof MealPhotoAccessError) {
        return NextResponse.json({ error: "photo_not_found" }, { status: 404 });
      }
      throw error;
    }

    const approxBytes = (photo.base64.length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "image_too_large" }, { status: 413 });
    }
    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        photo.mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
      )
    ) {
      return NextResponse.json({ error: "unsupported_mime_type" }, { status: 400 });
    }

    // Yalnızca açıkça istenirse (geliştirme/deneme) deterministik mock
    // kullanılır — production varsayılanı DEĞİLDİR.
    const recognitionSource =
      process.env.AI_FOOD_RECOGNITION_MODE === "mock"
        ? createDeterministicMockSource({
            image_base64: photo.base64,
            mime_type: photo.mimeType,
          })
        : undefined;

    const result = await analyzeFoodPhoto(
      { image_base64: photo.base64, mime_type: photo.mimeType },
      { recognitionSource },
    );
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
        {
          error: "ai_output_invalid",
          message: "AI sağlayıcısının yanıtı geçersiz/güvensiz.",
        },
        { status: 502 },
      );
    }
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
