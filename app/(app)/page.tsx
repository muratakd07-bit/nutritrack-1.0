"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgressBar } from "@/app/_components/ProgressBar";
import { ErrorCard, LoadingCard, SignInRequired } from "@/app/_components/StatusMessage";
import { apiFetch, isUnauthorized } from "@/app/_lib/api";
import { formatDayLabel, formatNumber, todayIso } from "@/app/_lib/format";
import type { MealItemView, SummaryResponse } from "@/app/_lib/types";
import { addDaysUTC, parseIsoDateUTC, toIsoDateUTC } from "@/lib/utils/date";
import { MEAL_TYPES, MEAL_TYPE_LABELS_TR, type MealType } from "@/types/meal";

type LoadState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: SummaryResponse; items: MealItemView[] };

function shiftDay(isoDate: string, days: number): string {
  return toIsoDateUTC(addDaysUTC(parseIsoDateUTC(isoDate)!, days));
}

/**
 * Günlük görünüm. Gösterilen TÜM nutrition değerleri sunucudan gelir:
 * günlük toplamlar /api/reports/summary (MealItem snapshot SUM'ı), kalem
 * değerleri /api/meals (ADIM 16 snapshot'ı). Bu component hiçbir nutrition
 * değeri hesaplamaz; yalnızca hedefe oranı (ilerleme çubuğu) gösterir.
 */
export default function Home() {
  const [date, setDate] = useState(todayIso);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isToday = date === todayIso();

  const load = useCallback(async (day: string) => {
    setState({ status: "loading" });
    try {
      const [summary, items] = await Promise.all([
        apiFetch<SummaryResponse>(`/api/reports/summary?date=${day}`),
        apiFetch<MealItemView[]>(`/api/meals?date=${day}`),
      ]);
      setState({ status: "ready", summary, items });
    } catch (error) {
      if (isUnauthorized(error)) {
        setState({ status: "unauthorized" });
      } else {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Veriler yüklenemedi.",
        });
      }
    }
  }, []);

  useEffect(() => {
    // Veri yüklemesi (dış sistemle senkronizasyon) — tarih değişince yeniden.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(date);
  }, [date, load]);

  async function handleDelete(item: MealItemView) {
    if (!window.confirm(`"${item.food.name}" silinsin mi?`)) return;
    setDeletingId(item.id);
    try {
      await apiFetch<void>(`/api/meals/${item.id}`, { method: "DELETE" });
      await load(date);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Silinemedi.");
    } finally {
      setDeletingId(null);
    }
  }

  const itemsByType = useMemo(() => {
    const groups = new Map<MealType, MealItemView[]>(MEAL_TYPES.map((t) => [t, []]));
    if (state.status === "ready") {
      for (const item of state.items) groups.get(item.mealType)?.push(item);
    }
    return groups;
  }, [state]);

  return (
    <main>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-5">
          <button
            type="button"
            onClick={() => setDate((d) => shiftDay(d, -1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label="Önceki gün"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-emerald-600">NutriTrack</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">
              {formatDayLabel(date)}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setDate((d) => shiftDay(d, 1))}
            disabled={isToday}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:invisible"
            aria-label="Sonraki gün"
          >
            ›
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-5 py-6">
        {state.status === "loading" && <LoadingCard />}
        {state.status === "unauthorized" && <SignInRequired />}
        {state.status === "error" && (
          <ErrorCard message={state.message} onRetry={() => void load(date)} />
        )}

        {state.status === "ready" && (
          <>
            <DailyTotals summary={state.summary} />

            {!isToday && (
              <p className="rounded-2xl bg-slate-100 p-3 text-center text-xs text-slate-500">
                Geçmiş günleri görüntüleyebilir ve silebilirsin; yeni kayıtlar
                yalnızca bugüne eklenir.
              </p>
            )}

            <section className="space-y-4">
              {MEAL_TYPES.map((type) => (
                <MealSection
                  key={type}
                  type={type}
                  items={itemsByType.get(type) ?? []}
                  canAdd={isToday}
                  deletingId={deletingId}
                  onDelete={handleDelete}
                />
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function DailyTotals({ summary }: { summary: SummaryResponse }) {
  const day = summary.days[0];
  const goals = summary.goals;
  const remaining = goals ? goals.energy_kcal - day.energy_kcal : null;

  return (
    <>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-medium text-slate-500">Günlük Kalori</p>
        <p className="mt-2 text-4xl font-bold tracking-tight">
          {formatNumber(day.energy_kcal, 0)}
          {goals && (
            <span className="text-lg font-medium text-slate-400">
              {" "}/ {formatNumber(goals.energy_kcal, 0)} kcal
            </span>
          )}
          {!goals && <span className="text-lg font-medium text-slate-400"> kcal</span>}
        </p>
        <div className="mt-5">
          <ProgressBar current={day.energy_kcal} goal={goals?.energy_kcal ?? null} size="lg" />
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {remaining === null && "Henüz günlük hedefin belirlenmedi — hedefleri antrenörün belirler."}
          {remaining !== null && remaining >= 0 && (
            <>
              Hedefe <strong className="text-slate-700">{formatNumber(remaining, 0)} kcal</strong> kaldı.
            </>
          )}
          {remaining !== null && remaining < 0 && (
            <>
              Hedefi <strong className="text-amber-700">{formatNumber(-remaining, 0)} kcal</strong> aştın.
            </>
          )}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MacroCard title="Protein" current={day.protein_g} goal={goals?.protein_g ?? null} />
        <MacroCard title="Karbonhidrat" current={day.carbohydrates_g} goal={goals?.carbohydrates_g ?? null} />
        <MacroCard title="Yağ" current={day.fat_g} goal={goals?.fat_g ?? null} />
      </section>
    </>
  );
}

function MacroCard({ title, current, goal }: { title: string; current: number; goal: number | null }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <div className="mt-2 flex items-end justify-between">
        <p className="text-2xl font-bold">{formatNumber(current)} g</p>
        {goal !== null && <p className="text-xs text-slate-400">/ {formatNumber(goal)} g</p>}
      </div>
      <div className="mt-4">
        <ProgressBar current={current} goal={goal} />
      </div>
    </div>
  );
}

function MealSection({
  type,
  items,
  canAdd,
  deletingId,
  onDelete,
}: {
  type: MealType;
  items: MealItemView[];
  canAdd: boolean;
  deletingId: string | null;
  onDelete: (item: MealItemView) => void;
}) {
  // Öğün toplamı: zaten hesaplanmış kalem snapshot'larının TOPLAMI (SUM) —
  // yeni bir nutrition sonucu üretmez (bkz. domain/reports/dailySummary.ts).
  const totalKcal = items.reduce((sum, item) => sum + item.energyKcal, 0);

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{MEAL_TYPE_LABELS_TR[type]}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {items.length > 0 ? `${formatNumber(totalKcal, 0)} kcal` : "Henüz eklenmedi"}
          </p>
        </div>
        {canAdd && (
          <Link
            href={`/meals/add?type=${type}`}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg font-semibold text-emerald-700 hover:bg-emerald-100"
            aria-label={`${MEAL_TYPE_LABELS_TR[type]} ekle`}
          >
            +
          </Link>
        )}
      </div>

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{item.food.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatNumber(item.consumedWeightG, 0)} g · {formatNumber(item.energyKcal, 0)} kcal · P{" "}
                  {formatNumber(item.proteinG)} · K {formatNumber(item.carbohydratesG)} · Y{" "}
                  {formatNumber(item.fatG)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(item)}
                disabled={deletingId === item.id}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                {deletingId === item.id ? "Siliniyor..." : "Sil"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
