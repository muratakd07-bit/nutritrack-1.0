"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorCard, LoadingCard, SignInRequired } from "@/app/_components/StatusMessage";
import { apiFetch, isUnauthorized } from "@/app/_lib/api";
import { formatNumber } from "@/app/_lib/format";
import type { SummaryResponse } from "@/app/_lib/types";
import type { UserProfile } from "@/domain/users/service";
import { createSupabaseBrowserClient } from "@/lib/auth/supabaseBrowserClient";

const ROLE_LABELS: Record<UserProfile["role"], string> = {
  USER: "Kullanıcı",
  TRAINER: "Antrenör",
  ADMIN: "Yönetici",
};

type LoadState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: UserProfile; goals: SummaryResponse["goals"] };

export default function ProfilePage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [profile, summary] = await Promise.all([
        apiFetch<UserProfile>("/api/me"),
        apiFetch<SummaryResponse>("/api/reports/summary"),
      ]);
      setState({ status: "ready", profile, goals: summary.goals });
    } catch (error) {
      if (isUnauthorized(error)) setState({ status: "unauthorized" });
      else
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Profil yüklenemedi.",
        });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      // Supabase yapılandırılmamışsa zaten oturum yoktur; yine de girişe dön.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <main>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-5">
          <p className="text-sm font-medium text-emerald-600">NutriTrack</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Profil</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-5 py-6">
        {state.status === "loading" && <LoadingCard />}
        {state.status === "unauthorized" && <SignInRequired />}
        {state.status === "error" && <ErrorCard message={state.message} onRetry={() => void load()} />}

        {state.status === "ready" && (
          <>
            <section className="flex items-center gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-semibold text-emerald-700">
                {(state.profile.display_name ?? state.profile.email).charAt(0).toLocaleUpperCase("tr-TR")}
              </div>
              <div className="min-w-0">
                {state.profile.display_name && (
                  <p className="truncate font-semibold">{state.profile.display_name}</p>
                )}
                <p className="truncate text-sm text-slate-600">{state.profile.email}</p>
                <p className="mt-1 inline-block rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {ROLE_LABELS[state.profile.role]}
                </p>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="font-semibold">Günlük hedeflerin</h2>
              {state.goals ? (
                <>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <Goal label="Kalori" value={`${formatNumber(state.goals.energy_kcal, 0)} kcal`} />
                    <Goal label="Protein" value={`${formatNumber(state.goals.protein_g)} g`} />
                    <Goal label="Karbonhidrat" value={`${formatNumber(state.goals.carbohydrates_g)} g`} />
                    <Goal label="Yağ" value={`${formatNumber(state.goals.fat_g)} g`} />
                    <Goal label="Lif" value={`${formatNumber(state.goals.fiber_g)} g`} />
                    <Goal label="Su" value={`${formatNumber(state.goals.water_ml, 0)} ml`} />
                  </dl>
                  <p className="mt-4 text-xs text-slate-400">
                    {state.goals.set_by === "TRAINER" ? "Antrenörün" : "Sistem"} tarafından{" "}
                    {new Date(state.goals.effective_from).toLocaleDateString("tr-TR")} tarihinde belirlendi.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Henüz bir hedef belirlenmedi. Günlük hedeflerini antrenörün belirler.
                </p>
              )}
            </section>
          </>
        )}

        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-red-600 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 disabled:opacity-60"
        >
          {signingOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}
        </button>
      </div>
    </main>
  );
}

function Goal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
