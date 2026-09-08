import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabaseServerClient";

/**
 * Supabase'in e-posta onay/magic-link bağlantılarının yönlendirdiği uç nokta
 * (bkz. app/signup/page.tsx'teki `emailRedirectTo`). Gelen `code`'u gerçek
 * bir oturuma çevirir (PKCE akışı) ve ana sayfaya yönlendirir.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
}
