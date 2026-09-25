"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorCard, LoadingCard, SignInRequired } from "@/app/_components/StatusMessage";
import { apiFetch, isUnauthorized } from "@/app/_lib/api";
import { formatNumber, formatShortDay } from "@/app/_lib/format";
import type { DaySummary, SummaryResponse } from "@/app/_lib/types";

const RANGES = [7, 30] as const;
type Range = (typeof RANGES)[number];

type LoadState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: SummaryResponse };

/**
 * Son 7/30 günün raporu. Günlük değerler sunucudaki snapshot SUM'larıdır;
 * burada yalnızca kayıt girilmiş günlerin ortalaması alınır (zaten
 * hesaplanmış toplamların aritmetik ortalaması — yeni bir nutrition sonucu
 * değildir).
 */
export default function ReportsPage() {
  const [range, setRange] = useState<Range>(7);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async (days: Range) => {
    setState({ status: "loading" });
    try {
      const summary = await apiFetch<SummaryResponse>(`/api/reports/summary?days=${days}`);
      setState({ status: "ready", summary });
    } catch (error) {
      if (isUnauthorized(error)) setState({ status: "unauthorized" });
      else
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Rapor yüklenemedi.",
        });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(range);
  }, [range, load]);

  return (
    <main>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
          <div>
            <p className="text-sm font-medium text-emerald-600">NutriTrack</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Raporlar</h1>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Zaman aralığı">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {r} gün
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-5 py-6">
        {state.status === "loading" && <LoadingCard />}
        {state.status === "unauthorized" && <SignInRequired />}
        {state.status === "error" && (
          <ErrorCard message={state.message} onRetry={() => void load(range)} />
        )}
        {state.status === "ready" && <Report summary={state.summary} />}
      </div>
    </main>
  );
}

function Report({ summary }: { summary: SummaryResponse }) {
  const loggedDays = summary.days.filter((d) => d.item_count > 0);
  const goals = summary.goals;

  if (loggedDays.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Bu aralıkta kayıtlı öğün yok.
      </div>
    );
  }

  const average = (pick: (d: DaySummary) => number) =>
    loggedDays.reduce((sum, d) => sum + pick(d), 0) / loggedDays.length;

  const withinGoal = goals
    ? loggedDays.filter((d) => d.energy_kcal <= goals.energy_kcal).length
    : null;

  return (
    <>
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Ort. kalori" value={`${formatNumber(average((d) => d.energy_kcal), 0)} kcal`} />
        <StatTile label="Ort. protein" value={`${formatNumber(average((d) => d.protein_g))} g`} />
        <StatTile label="Kayıtlı gün" value={`${loggedDays.length} / ${summary.days.length}`} />
        <StatTile
          label="Hedef içinde"
          value={withinGoal === null ? "—" : `${withinGoal} gün`}
        />
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold">Günlük kalori</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {goals
            ? `Kesikli çizgi: günlük hedef (${formatNumber(goals.energy_kcal, 0)} kcal)`
            : "Günlük hedef henüz belirlenmedi."}
        </p>
        <CalorieChart days={summary.days} goalKcal={goals?.energy_kcal ?? null} />
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold">Günlük dökümü</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Gün</th>
                <th className="py-2 pr-3 text-right font-medium">kcal</th>
                <th className="py-2 pr-3 text-right font-medium">Protein</th>
                <th className="py-2 pr-3 text-right font-medium">Karb.</th>
                <th className="py-2 pr-3 text-right font-medium">Yağ</th>
                <th className="py-2 text-right font-medium">Lif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {[...summary.days].reverse().map((d) => (
                <tr key={d.date} className={d.item_count === 0 ? "text-slate-400" : ""}>
                  <td className="py-2 pr-3">{formatShortDay(d.date)}</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(d.energy_kcal, 0)}</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(d.protein_g)} g</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(d.carbohydrates_g)} g</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(d.fat_g)} g</td>
                  <td className="py-2 text-right">{formatNumber(d.fiber_g)} g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Tek seri çubuk grafik: günlük kalori, isteğe bağlı hedef referans çizgisi.
 * Her çubuğun hover/focus alanı tüm sütundur; değer tooltip'te görünür.
 */
function CalorieChart({ days, goalKcal }: { days: DaySummary[]; goalKcal: number | null }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxValue = Math.max(goalKcal ?? 0, ...days.map((d) => d.energy_kcal), 1) * 1.1;
  const showEveryNthLabel = days.length > 10 ? 5 : 1;

  return (
    <div className="mt-10">
      <div className="relative h-48">
        {goalKcal !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-400"
            style={{ bottom: `${(goalKcal / maxValue) * 100}%` }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-slate-200">
          {days.map((d, i) => {
            const over = goalKcal !== null && d.energy_kcal > goalKcal;
            return (
              <div
                key={d.date}
                className="group relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                tabIndex={0}
                aria-label={`${formatShortDay(d.date)}: ${formatNumber(d.energy_kcal, 0)} kcal`}
              >
                <div
                  className={`w-full max-w-8 rounded-t ${
                    over ? "bg-amber-500" : "bg-emerald-500"
                  } ${hovered === i ? "opacity-80" : ""}`}
                  style={{ height: `${(d.energy_kcal / maxValue) * 100}%` }}
                />
                {hovered === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow">
                    {formatShortDay(d.date)} · {formatNumber(d.energy_kcal, 0)} kcal
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-slate-400">
        {days.map((d, i) => (
          <span key={d.date} className="flex-1 text-center">
            {(days.length - 1 - i) % showEveryNthLabel === 0 ? formatShortDay(d.date) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
