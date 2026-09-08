import { createBrowserClient } from "@supabase/ssr";

/**
 * Client component'lerden çağrılmak üzere hazırlanmıştır. Şu an hiçbir
 * client component tarafından kullanılmıyor (mevcut demo UI'a dokunulmadı);
 * ileride gerçek login/signup ekranları eklendiğinde kullanılacak.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase ortam değişkenleri (NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY) tanımlı değil.",
    );
  }

  return createBrowserClient(url, anonKey);
}
