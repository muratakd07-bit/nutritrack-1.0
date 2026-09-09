import Link from "next/link";

/**
 * `app/auth/callback/route.ts`'in `exchangeCodeForSession` BAŞARISIZ
 * olduğunda (ör. onay bağlantısı, kaydın başlatıldığı tarayıcıdan FARKLI
 * bir tarayıcıda/cihazda açıldığında — PKCE `code_verifier` çerezi orada
 * yoktur) yönlendirdiği sayfa. Kullanıcıya "giriş yapmış gibi" YANLIŞ bir
 * izlenim vermek yerine, ne olduğunu ve ne yapması gerektiğini AÇIKÇA
 * söyler.
 */
const REASON_MESSAGES: Record<string, string> = {
  missing_code:
    "Onay bağlantısı eksik veya geçersiz görünüyor. Lütfen e-postandaki bağlantıya tekrar tıkla.",
  exchange_failed:
    "Onay bağlantısı bu tarayıcıda tamamlanamadı. Bu genellikle bağlantının, kayıt işlemini BAŞLATTIĞIN tarayıcıdan/cihazdan FARKLI bir tarayıcıda/cihazda açılmasından kaynaklanır. Lütfen kayıt olduğun tarayıcıda tekrar dene, ya da yeniden kayıt olup e-postanı AYNI tarayıcıda aç.",
};

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message =
    (reason && REASON_MESSAGES[reason]) ??
    "Hesabını onaylarken bir sorun oluştu. Lütfen tekrar dene.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-medium text-red-600">NutriTrack</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Onay tamamlanamadı
        </h1>
        <p className="mt-3 text-sm text-slate-500">{message}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/login"
            className="text-sm font-medium text-emerald-600"
          >
            Giriş sayfasına dön
          </Link>
          <Link href="/signup" className="text-sm font-medium text-slate-500">
            Yeniden kayıt ol
          </Link>
        </div>
      </div>
    </main>
  );
}
