import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Öğün fotoğrafları için private Supabase Storage bucket'ı — bkz.
 * supabase/storage-setup.sql (RLS: her kullanıcı yalnızca kendi
 * `{userId}/...` klasörüne yazabilir/okuyabilir).
 */
export const MEAL_PHOTOS_BUCKET = "meal-photos";

export class MealPhotoAccessError extends Error {
  constructor(storagePath: string) {
    super(
      `Fotoğraf indirilemedi: ${storagePath} (bulunamadı veya bu kullanıcıya ait değil)`,
    );
    this.name = "MealPhotoAccessError";
  }
}

/**
 * Yeni bir fotoğraf için `{userId}/{uuid}.{ext}` yolu üretir. Hem
 * client (tarayıcı) hem server'da çalışması için `node:crypto` yerine
 * evrensel Web Crypto API (`crypto.randomUUID()`) kullanılır.
 */
export function buildMealPhotoPath(userId: string, fileExtension: string): string {
  return `${userId}/${crypto.randomUUID()}.${fileExtension}`;
}

/** `storagePath`'in gerçekten `userId`'ye ait olup olmadığını (RLS'den ÖNCE, hızlı bir ön kontrol olarak) doğrular. */
export function isOwnedPath(storagePath: string, userId: string): boolean {
  return storagePath.startsWith(`${userId}/`);
}

/**
 * Private bucket'tan bir fotoğrafı, ÇAĞIRANIN kendi oturumuna bağlı
 * (RLS'ye tabi) bir Supabase client'ı ile indirir ve base64'e çevirir.
 *
 * KRİTİK: `supabase` parametresi HER ZAMAN kullanıcının kendi oturumuna
 * bağlı bir client olmalıdır (bkz. lib/auth/supabaseServerClient.ts) —
 * service-role bir client ASLA kullanılmamalıdır, aksi halde RLS
 * bypass edilir ve bir kullanıcı başka birinin fotoğrafını indirebilir.
 */
export async function downloadMealPhotoAsBase64(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ base64: string; mimeType: string }> {
  const { data, error } = await supabase.storage
    .from(MEAL_PHOTOS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new MealPhotoAccessError(storagePath);
  }

  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { base64, mimeType: data.type || "application/octet-stream" };
}
