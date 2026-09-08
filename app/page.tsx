"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/auth/supabaseBrowserClient";

type Meal = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const demoMeals: Meal[] = [
  {
    name: "Kahvaltı",
    calories: 250,
    protein: 15,
    carbs: 25,
    fat: 8,
  },
  {
    name: "Öğle Yemeği",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  },
  {
    name: "Akşam Yemeği",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  },
  {
    name: "Ara Öğün",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  },
];

// DEMO UI verileri.
// Gerçek beslenme değerleri ileride ADIM 16 calculated_nutrition
// kaynağından gelecektir. Bu component herhangi bir beslenme hesabı yapmaz.

export default function Home() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("Ana Sayfa");
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  // Oturum durumu yalnızca header'daki Giriş/Çıkış kontrolü için okunur;
  // aşağıdaki demo beslenme verileri bundan etkilenmez (ADIM 16 bağlanana
  // kadar bu component hiçbir nutrition hesabı yapmaz).
  useEffect(() => {
    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      // Supabase yapılandırılmamışsa Giriş/Çıkış kontrolünü sessizce gizle;
      // demo dashboard yine de çalışmaya devam eder.
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setIsSignedIn(data.session !== null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsSignedIn(session !== null);
      },
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const calories = 525;
  const calorieGoal = 2200;

  const protein = 44.7;
  const proteinGoal = 160;

  const carbs = 61.1;
  const carbsGoal = 220;

  const fat = 18;
  const fatGoal = 70;

  return (
    <main className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div>
            <p className="text-sm font-medium text-emerald-600">
              NutriTrack
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Bugünkü Beslenmen
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {isSignedIn === true && (
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                Çıkış Yap
              </button>
            )}

            {isSignedIn === false && (
              <Link
                href="/login"
                className="text-sm font-medium text-emerald-600 transition hover:text-emerald-700"
              >
                Giriş Yap
              </Link>
            )}

            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
              M
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        <section className="grid gap-5 lg:grid-cols-3">
          {/* Calories */}
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Günlük Kalori
                </p>

                <p className="mt-2 text-4xl font-bold tracking-tight">
                  {calories}{" "}
                  <span className="text-lg font-medium text-slate-400">
                    / {calorieGoal} kcal
                  </span>
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                %23,9
              </div>
            </div>

            <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: "23.9%" }}
              />
            </div>

            <p className="mt-3 text-sm text-slate-500">
              Bugün için <strong className="text-slate-700">1675 kcal</strong>{" "}
              kaldı.
            </p>
          </div>

          {/* Coach */}
          <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl">
              ✦
            </div>

            <h2 className="mt-5 text-xl font-bold">AI Beslenme Koçu</h2>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              Bugünkü beslenmeni analiz et ve sana özel öneriler al.
            </p>

            <button
              type="button"
              className="mt-6 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Beslenmemi Analiz Et
            </button>
          </div>
        </section>

        {/* Macros */}
        <section className="mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Günlük Makroların</h2>
            <p className="mt-1 text-sm text-slate-500">
              Bugünkü makro hedeflerine olan ilerlemen
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <MacroCard
              title="Protein"
              current={`${protein.toLocaleString("tr-TR")} g`}
              goal={`${proteinGoal} g`}
              progress={(protein / proteinGoal) * 100}
            />

            <MacroCard
              title="Karbonhidrat"
              current={`${carbs.toLocaleString("tr-TR")} g`}
              goal={`${carbsGoal} g`}
              progress={(carbs / carbsGoal) * 100}
            />

            <MacroCard
              title="Yağ"
              current={`${fat} g`}
              goal={`${fatGoal} g`}
              progress={(fat / fatGoal) * 100}
            />
          </div>
        </section>

        {/* Meals */}
        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold">Bugünkü Öğünler</h2>
              <p className="mt-1 text-sm text-slate-500">
                Gün içinde eklediğin öğünler
              </p>
            </div>

            <button
              type="button"
              className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              + Öğün Ekle
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {demoMeals.map((meal) => (
              <div
                key={meal.name}
                className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{meal.name}</h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {meal.calories > 0
                        ? `${meal.calories} kcal`
                        : "Henüz eklenmedi"}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-600"
                    aria-label={`${meal.name} ekle`}
                  >
                    +
                  </button>
                </div>

                {meal.calories > 0 && (
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-slate-400">Protein</p>
                      <p className="mt-1 font-semibold">{meal.protein} g</p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-slate-400">Karbonhidrat</p>
                      <p className="mt-1 font-semibold">{meal.carbs} g</p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-slate-400">Yağ</p>
                      <p className="mt-1 font-semibold">{meal.fat} g</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Daily Goals */}
        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-bold">Günlük Hedeflerin</h2>
          <p className="mt-1 text-sm text-slate-500">
            Bugünkü hedeflerine olan genel ilerlemen
          </p>

          <div className="mt-6 space-y-5">
            <GoalRow
              label="Kalori"
              current="525 kcal"
              goal="2200 kcal"
              progress={23.9}
            />

            <GoalRow
              label="Protein"
              current="44,7 g"
              goal="160 g"
              progress={(protein / proteinGoal) * 100}
            />

            <GoalRow
              label="Karbonhidrat"
              current="61,1 g"
              goal="220 g"
              progress={(carbs / carbsGoal) * 100}
            />

            <GoalRow
              label="Yağ"
              current="18 g"
              goal="70 g"
              progress={(fat / fatGoal) * 100}
            />
          </div>
        </section>
      </div>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-around px-2 py-2">
          {["Ana Sayfa", "Öğünler", "Raporlar", "Koç", "Profil"].map(
            (item) => {
              const active = activeNav === item;

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setActiveNav(item)}
                  className={`flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition ${
                    active
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base">
                    {item === "Ana Sayfa"
                      ? "⌂"
                      : item === "Öğünler"
                        ? "◉"
                        : item === "Raporlar"
                          ? "▥"
                          : item === "Koç"
                            ? "✦"
                            : "○"}
                  </span>

                  {item}
                </button>
              );
            },
          )}
        </div>
      </nav>
    </main>
  );
}

type MacroCardProps = {
  title: string;
  current: string;
  goal: string;
  progress: number;
};

function MacroCard({
  title,
  current,
  goal,
  progress,
}: MacroCardProps) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{title}</p>

      <div className="mt-2 flex items-end justify-between">
        <p className="text-2xl font-bold">{current}</p>
        <p className="text-xs text-slate-400">/ {goal}</p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  );
}

type GoalRowProps = {
  label: string;
  current: string;
  goal: string;
  progress: number;
};

function GoalRow({
  label,
  current,
  goal,
  progress,
}: GoalRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>

        <span className="text-slate-500">
          {current} / {goal}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  );
}