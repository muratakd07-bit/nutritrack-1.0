"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/auth/supabaseBrowserClient";
import { signUpInputSchema } from "@/lib/validation/auth";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = signUpInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Geçersiz giriş");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        ...parsed.data,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session) {
        // E-posta onayı gerekmiyor (proje ayarına bağlı) — oturum hemen açıldı.
        router.push("/");
        router.refresh();
        return;
      }

      // E-posta onayı bekleniyor.
      setConfirmationSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmationSent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-emerald-600">NutriTrack</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            E-postanı kontrol et
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {email} adresine bir onay bağlantısı gönderdik. Hesabını
            etkinleştirmek için bağlantıya tıkla, ardından giriş yap.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-emerald-600"
          >
            Giriş sayfasına dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-medium text-emerald-600">NutriTrack</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Kayıt Ol</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              E-posta
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Şifre
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">En az 8 karakter.</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Kayıt olunuyor..." : "Kayıt Ol"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Zaten hesabın var mı?{" "}
          <Link href="/login" className="font-medium text-emerald-600">
            Giriş yap
          </Link>
        </p>
      </div>
    </main>
  );
}
