import {
  createSupabaseServerClient,
  SupabaseNotConfiguredError,
} from "./supabaseServerClient";

/**
 * İstekte kimliği doğrulanmış kullanıcının id'sini döner.
 *
 * FAIL-CLOSED: oturum yoksa, token geçersizse VEYA Supabase henüz
 * yapılandırılmamışsa `null` döner. Çağıran API route'ları bu durumda
 * 401 Unauthorized dönmelidir. Hiçbir koşulda varsayılan/sahte bir
 * kullanıcı kimliğine geri düşülmez (no fallback user).
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return null;
    }
    return data.user.id;
  } catch (error) {
    if (error instanceof SupabaseNotConfiguredError) {
      return null;
    }
    throw error;
  }
}
