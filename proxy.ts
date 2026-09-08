import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Her istekte Supabase oturum (access token) yenilemesini tetikler.
 *
 * Supabase Auth erişim token'ları kısa ömürlüdür; bu proxy olmadan
 * Server Component/Route Handler'lar süresi dolmuş bir token'la
 * karşılaşabilir. `@supabase/ssr`'nin `getAll`/`setAll` cookie köprüsü
 * üzerinden, gerekirse token'ı sessizce yeniler ve güncel cookie'leri hem
 * gelen isteğe hem de yanıta yazar.
 *
 * Supabase henüz yapılandırılmadıysa (env boş) hiçbir şey yapmadan geçer —
 * fail-closed davranış zaten lib/auth/session.ts'te sağlanıyor.
 *
 * Not: Next.js 16'da bu dosya konvansiyonu `middleware` → `proxy` olarak
 * yeniden adlandırıldı (eski adı deprecated). bkz.
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Sonucu kullanmıyoruz — tek amacı, gerekiyorsa token'ı yenileyip
  // cookie'leri güncellemek (yukarıdaki setAll içinde olur).
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
