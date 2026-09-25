"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { ErrorCard, SignInRequired } from "@/app/_components/StatusMessage";
import { ApiError, apiFetch, isUnauthorized } from "@/app/_lib/api";
import { formatNumber } from "@/app/_lib/format";
import type { MealItemView } from "@/app/_lib/types";
import type { FoodSearchResult } from "@/domain/foods/service";
import { MEAL_TYPES, MEAL_TYPE_LABELS_TR, type MealType } from "@/types/meal";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; results: FoodSearchResult[] };

function defaultMealType(param: string | null): MealType {
  return MEAL_TYPES.find((t) => t === param) ?? "SNACK";
}

export default function AddMealPage() {
  return (
    <Suspense>
      <AddMealForm />
    </Suspense>
  );
}

/**
 * Elle öğün ekleme: besin ara → seç → gramaj gir → POST /api/meals.
 *
 * Aramada gösterilen 100g değerleri yalnızca REFERANSTIR; bu sayfa girilen
 * gramaj için kalori/makro HESAPLAMAZ. Kaydedilen değerler ADIM 16'nın
 * ürettiği ve POST yanıtında dönen snapshot'tır.
 */
function AddMealForm() {
  const searchParams = useSearchParams();
  const [mealType, setMealType] = useState<MealType>(() =>
    defaultMealType(searchParams.get("type")),
  );
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [weight, setWeight] = useState("100");
  // Aynı seçim için çift gönderimi engeller; her yeni seçimde yenilenir.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [added, setAdded] = useState<MealItemView[]>([]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearch({ status: "idle" });
      return;
    }

    let cancelled = false;
    setSearch({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const results = await apiFetch<FoodSearchResult[]>(
          `/api/foods/search?q=${encodeURIComponent(trimmedQuery)}`,
        );
        if (!cancelled) setSearch({ status: "ready", results });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthorized(error)) setSearch({ status: "unauthorized" });
        else
          setSearch({
            status: "error",
            message: error instanceof Error ? error.message : "Arama başarısız.",
          });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  function selectFood(food: FoodSearchResult) {
    setSelected(food);
    setWeight("100");
    setIdempotencyKey(crypto.randomUUID());
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !idempotencyKey) return;

    const weightG = Number(weight.replace(",", "."));
    if (!(weightG > 0) || weightG > 10000) {
      setSubmitError("0 ile 10000 arasında geçerli bir gramaj gir.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const item = await apiFetch<Omit<MealItemView, "food">>("/api/meals", {
        method: "POST",
        body: JSON.stringify({
          food_id: selected.food_id,
          consumed_weight_g: weightG,
          meal_type: mealType,
          idempotency_key: idempotencyKey,
        }),
      });
      setAdded((prev) => [...prev, { ...item, food: { name: selected.name } }]);
      setSelected(null);
      setIdempotencyKey(null);
      setQuery("");
    } catch (error) {
      setSubmitError(mapSubmitError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="px-5 py-8">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="text-sm font-medium text-emerald-600">
          ← Ana sayfaya dön
        </Link>

        <div className="mt-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-emerald-600">NutriTrack</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Öğün Ekle</h1>

          <div className="mt-5">
            <label htmlFor="mealType" className="block text-sm font-medium text-slate-700">
              Öğün
            </label>
            <select
              id="mealType"
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              {MEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MEAL_TYPE_LABELS_TR[type]}
                </option>
              ))}
            </select>
          </div>

          {!selected && (
            <div className="mt-5">
              <label htmlFor="foodQuery" className="block text-sm font-medium text-slate-700">
                Besin ara
              </label>
              <input
                id="foodQuery"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ör. rice, chicken breast, yoğurt"
                autoComplete="off"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-400">
                Besin veritabanı (USDA) İngilizce; yaygın Türkçe kelimeler otomatik çevrilir.
              </p>

              <div className="mt-4">
                {search.status === "loading" && (
                  <p className="text-sm text-slate-500">Aranıyor...</p>
                )}
                {search.status === "unauthorized" && <SignInRequired />}
                {search.status === "error" && <ErrorCard message={search.message} />}
                {search.status === "ready" && search.results.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Sonuç bulunamadı. Farklı bir kelime dene ya da{" "}
                    <Link href="/meals/add-photo" className="text-emerald-600 underline">
                      fotoğrafla ekle
                    </Link>
                    .
                  </p>
                )}
                {search.status === "ready" && search.results.length > 0 && (
                  <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200">
                    {search.results.map((food) => (
                      <li key={food.food_id}>
                        <button
                          type="button"
                          onClick={() => selectFood(food)}
                          className="w-full px-4 py-3 text-left hover:bg-emerald-50"
                        >
                          <p className="text-sm font-medium text-slate-800">{food.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            100 g: {formatNumber(food.per_100g.energy_kcal_per_100g, 0)} kcal · P{" "}
                            {formatNumber(food.per_100g.protein_g_per_100g)} · K{" "}
                            {formatNumber(food.per_100g.carbohydrates_g_per_100g)} · Y{" "}
                            {formatNumber(food.per_100g.fat_g_per_100g)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {selected && (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">{selected.name}</p>
                <p className="mt-1 text-xs text-emerald-800">
                  100 g referans: {formatNumber(selected.per_100g.energy_kcal_per_100g, 0)} kcal ·
                  Kaynak: {selected.source}
                </p>
              </div>

              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-slate-700">
                  Miktar (gram)
                </label>
                <input
                  id="weight"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="10000"
                  step="any"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              {submitError && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{submitError}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {submitting ? "Ekleniyor..." : "Ekle"}
                </button>
              </div>
            </form>
          )}

          {added.length > 0 && (
            <div className="mt-6 rounded-2xl border border-emerald-200 p-4">
              <p className="text-sm font-semibold text-slate-800">Eklenenler</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {added.map((item) => (
                  <li key={item.id}>
                    {item.food.name} — {formatNumber(item.consumedWeightG, 0)} g,{" "}
                    <strong>{formatNumber(item.energyKcal, 0)} kcal</strong>
                  </li>
                ))}
              </ul>
              <Link
                href="/"
                className="mt-4 block rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800"
              >
                Bitti, günlüğe dön
              </Link>
            </div>
          )}
        </div>

        <Link
          href="/meals/add-photo"
          className="mt-4 block rounded-3xl bg-white p-5 text-center text-sm font-semibold text-emerald-700 shadow-sm ring-1 ring-slate-200 hover:bg-emerald-50"
        >
          📷 Fotoğrafla ekle
        </Link>
      </div>
    </main>
  );
}

function mapSubmitError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Devam etmek için giriş yapmalısın.";
    if (error.code === "food_nutrition_facts_not_found")
      return "Bu besin için doğrulanmış besin değeri bulunamadı.";
    if (error.code === "validation_error") return "Girdi geçersiz, gramajı kontrol et.";
    return error.message;
  }
  return "Kaydedilirken bir hata oluştu.";
}
