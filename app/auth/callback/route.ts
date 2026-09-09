import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabaseServerClient";

/**
 * Supabase'in e-posta onay/magic-link bağlantılarının yönlendirdiği uç nokta
 * (bkz. app/signup/page.tsx'teki `emailRedirectTo`). Gelen `code`'u gerçek
 * bir oturuma çevirir (PKCE akışı).
 *
 * GERÇEK BİR HATA (ADIM 30'un canlı auth testinde bulundu): Bu route,
 * `exchangeCodeForSession`'ın döndürdüğü `error`'ı HİÇ kontrol etmeden her
 * durumda `/`'a yönlendiriyordu. PKCE akışında `code_verifier`, signup'ın
 * BAŞLATILDIĞI tarayıcıda bir çerezde saklanır — onay bağlantısı FARKLI bir
 * tarayıcıda/cihazda açılırsa (ör. e-posta istemcisi başka bir tarayıcıda
 * açılırsa) bu çerez orada YOKTUR, `exchangeCodeForSession` başarısız olur,
 * ama kullanıcı yine de `/`'a düşüp SANKİ giriş yapmış gibi görünürdü —
 * gerçekte HİÇBİR session/refresh_token satırı oluşmuyordu (canlı olarak
 * `auth.sessions`'ta 0 satırla doğrulandı). Artık başarısızlık AÇIKÇA
 * ayrı bir hata sayfasına yönlendiriliyor — code_verifier/PKCE
 * doğrulaması KENDİSİ gevşetilmedi, yalnızca SONUCU artık kontrol ediliyor.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/auth-code-error?reason=missing_code`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/auth-code-error?reason=exchange_failed`,
    );
  }

  return NextResponse.redirect(`${origin}/`);
}
