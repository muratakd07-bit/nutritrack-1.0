import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase ortam değişkenleri (NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY) tanımlı değil. .env.example'a bakın.",
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

/**
 * Route Handler veya Server Component içinden çağrılmalıdır. Supabase projesi
 * henüz bağlanmadıysa (env değişkenleri boş) `SupabaseNotConfiguredError`
 * fırlatır — sessizce "giriş yapılmamış" gibi davranmak yerine yapılandırma
 * eksikliğini açıkça bildirir. Çağıran taraf (bkz. lib/auth/session.ts) bunu
 * "kimliği doğrulanamadı" (401) anlamına gelecek şekilde yorumlar.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new SupabaseNotConfiguredError();
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component render'ı sırasında cookie yazılamaz; oturum
          // yenilemesi bu durumda middleware tarafından üstlenilmelidir.
        }
      },
    },
  });
}
