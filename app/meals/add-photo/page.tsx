"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent } from "react";
import { MEAL_TYPES, type MealType } from "@/types/meal";
import type { CalculatedNutrition } from "@/types/nutrition";
import { createSupabaseBrowserClient } from "@/lib/auth/supabaseBrowserClient";
import { MEAL_PHOTOS_BUCKET, buildMealPhotoPath } from "@/lib/storage/mealPhotos";

interface AnalyzedCandidate {
  food_id: string;
  name: string;
  label: string;
  match_source: "LOCAL" | "USDA_FDC";
  match_score: number;
  ai_confidence: number;
  /** FoodMatcher bu adayı GÜVENİLİR/otomatik saymıyor — kullanıcı açıkça seçmeli. */
  requires_user_confirmation: boolean;
  has_verified_facts: boolean;
}

interface PhotoAnalysisResult {
  candidates: AnalyzedCandidate[];
  estimated_weight_g: number;
  visual_description: string;
  is_ambiguous: boolean;
  is_low_confidence: boolean;
  is_unrecognized: boolean;
  /** AI VEYA FoodMatcher seviyesinde herhangi bir belirsizlik varsa true. */
  requires_user_confirmation: boolean;
}

interface DetectedItemGroup {
  label: string;
  aiConfidence: number;
  candidates: AnalyzedCandidate[];
}

interface AddedMealItemResult {
  label: string;
  foodName: string;
  weightG: number;
  nutrition: CalculatedNutrition;
}

type Step = "upload" | "uploading" | "analyzing" | "review" | "submitting" | "done";

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Aynı etikete ait adayları TEK bir grupta toplar — bir tabakta birden
 * fazla yiyecek varsa (ör. tavuk + pilav + salata), her biri KENDİ
 * seçimini ve KENDİ gramajını almalıdır; hepsini tek bir seçim listesinde
 * karıştırmak (eski davranış) yanlıştı.
 */
function groupByLabel(candidates: AnalyzedCandidate[]): DetectedItemGroup[] {
  const order: string[] = [];
  const byLabel = new Map<string, AnalyzedCandidate[]>();
  for (const c of candidates) {
    if (!byLabel.has(c.label)) {
      byLabel.set(c.label, []);
      order.push(c.label);
    }
    byLabel.get(c.label)!.push(c);
  }
  return order.map((label) => ({
    label,
    aiConfidence: byLabel.get(label)![0].ai_confidence,
    candidates: byLabel.get(label)!,
  }));
}

export default function AddPhotoPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysisResult | null>(null);

  // label -> seçilen food_id / gramaj. Her tespit edilen yiyecek KENDİ
  // seçimini ve KENDİ kullanıcı-onaylı gramajını taşır.
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [mealType, setMealType] = useState<MealType>("SNACK");
  const [addedItems, setAddedItems] = useState<AddedMealItemResult[]>([]);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  const groups = useMemo(
    () => (analysis ? groupByLabel(analysis.candidates) : []),
    [analysis],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setStep("uploading");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setError("Devam etmek için giriş yapmalısın.");
        setStep("upload");
        return;
      }

      // Fotoğraf DOĞRUDAN kullanıcının kendi private Storage klasörüne
      // yüklenir — API'ye büyük bir base64 payload GÖNDERİLMEZ, yalnızca
      // küçük bir referans (storage_path) gönderilecek.
      const extension = MIME_TO_EXTENSION[file.type] ?? "jpg";
      const storagePath = buildMealPhotoPath(userData.user.id, extension);

      const { error: uploadError } = await supabase.storage
        .from(MEAL_PHOTOS_BUCKET)
        .upload(storagePath, file, { contentType: file.type });

      if (uploadError) {
        setError("Fotoğraf yüklenemedi: " + uploadError.message);
        setStep("upload");
        return;
      }

      setStep("analyzing");

      const response = await fetch("/api/meals/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: storagePath }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(mapAnalyzeError(response.status, body?.error));
        setStep("upload");
        return;
      }

      const result: PhotoAnalysisResult = body.data;
      setAnalysis(result);

      const initialSelections: Record<string, string> = {};
      const initialWeights: Record<string, string> = {};
      for (const group of groupByLabel(result.candidates)) {
        // Yalnızca varsayılan bir ÖNERİ olarak ilk adayı işaretler —
        // kullanıcı bunu DEĞİŞTİREBİLİR/reddedebilir. Gramaj bilerek BOŞ
        // bırakılır: AI'nin estimated_weight_g'si TÜM tabak için TEK bir
        // toplam tahmindir, madde başına doğrudan kullanılamaz — kullanıcı
        // her madde için kendi gramajını girmelidir.
        initialSelections[group.label] = group.candidates[0]?.food_id ?? "";
        initialWeights[group.label] = "";
      }
      setSelections(initialSelections);
      setWeights(initialWeights);
      setAddedItems([]);
      setSubmitErrors([]);
      setStep("review");
    } catch {
      setError("Fotoğraf analiz edilirken bir hata oluştu.");
      setStep("upload");
    }
  }

  function handleRejectItem(label: string) {
    setSelections((prev) => {
      const next = { ...prev };
      delete next[label];
      return next;
    });
  }

  async function handleConfirmAll() {
    const toSubmit = groups
      .filter((g) => selections[g.label])
      .map((g) => ({
        label: g.label,
        food_id: selections[g.label],
        food_name: g.candidates.find((c) => c.food_id === selections[g.label])?.name ?? "",
        weight: Number(weights[g.label]),
      }));

    if (toSubmit.length === 0) {
      setError("Lütfen en az bir yiyecek seç.");
      return;
    }
    const invalidWeight = toSubmit.find((s) => !(s.weight > 0));
    if (invalidWeight) {
      setError(`"${invalidWeight.label}" için geçerli bir gramaj gir.`);
      return;
    }

    setError(null);
    setStep("submitting");

    const results: AddedMealItemResult[] = [];
    const errors: string[] = [];

    // Kasıtlı olarak SIRAYLA (paralel değil) — her biri kendi
    // idempotency/hata durumunu net raporlayabilsin diye.
    for (const item of toSubmit) {
      try {
        const response = await fetch("/api/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            food_id: item.food_id,
            consumed_weight_g: item.weight,
            meal_type: mealType,
          }),
        });
        const body = await response.json();
        if (!response.ok) {
          errors.push(`${item.label}: ${mapMealError(response.status, body?.error)}`);
          continue;
        }
        results.push({
          label: item.label,
          foodName: item.food_name,
          weightG: item.weight,
          nutrition: {
            energy_kcal: body.data.energyKcal,
            protein_g: body.data.proteinG,
            carbohydrates_g: body.data.carbohydratesG,
            fat_g: body.data.fatG,
            fiber_g: body.data.fiberG,
          },
        });
      } catch {
        errors.push(`${item.label}: kaydedilirken bir hata oluştu.`);
      }
    }

    setAddedItems(results);
    setSubmitErrors(errors);
    setStep("done");
  }

  const totals = useMemo(() => {
    return addedItems.reduce(
      (acc, item) => ({
        energy_kcal: acc.energy_kcal + item.nutrition.energy_kcal,
        protein_g: acc.protein_g + item.nutrition.protein_g,
        carbohydrates_g: acc.carbohydrates_g + item.nutrition.carbohydrates_g,
        fat_g: acc.fat_g + item.nutrition.fat_g,
        fiber_g: acc.fiber_g + item.nutrition.fiber_g,
      }),
      { energy_kcal: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0, fiber_g: 0 },
    );
  }, [addedItems]);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="text-sm font-medium text-emerald-600">
          ← Ana sayfaya dön
        </Link>

        <div className="mt-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-emerald-600">NutriTrack</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Fotoğrafla Öğün Ekle
          </h1>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {step === "upload" && (
            <div className="mt-6">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 hover:border-emerald-400">
                <span>Bir yemek fotoğrafı seç</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          )}

          {step === "uploading" && (
            <p className="mt-6 text-center text-sm text-slate-500">
              Fotoğraf yükleniyor...
            </p>
          )}

          {step === "analyzing" && (
            <p className="mt-6 text-center text-sm text-slate-500">
              Yemeğini analiz ediyorum...
            </p>
          )}

          {step === "review" && analysis && (
            <div className="mt-6 space-y-5">
              <p className="text-sm text-slate-500">{analysis.visual_description}</p>
              <p className="text-xs text-slate-400">
                AI&apos;nin TÜM tabak için tahmini: ~{analysis.estimated_weight_g}g
                (madde başına doğrudan kullanılmaz — her yiyecek için kendi
                gramajını aşağıda gir).
              </p>

              {analysis.is_unrecognized && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  Besin tanınamadı. Farklı bir fotoğraf deneyebilirsin.
                </p>
              )}
              {analysis.requires_user_confirmation && !analysis.is_unrecognized && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  Bazı eşleşmelerden emin değiliz — lütfen her yiyecek için
                  doğru seçeneği kontrol et/seç.
                </p>
              )}

              {groups.map((group) => (
                <div
                  key={group.label}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">
                      Tespit edilen: &quot;{group.label}&quot;
                    </p>
                    <span className="text-xs text-slate-400">
                      AI güveni %{Math.round(group.aiConfidence * 100)}
                    </span>
                  </div>

                  {selections[group.label] === undefined ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Bu maddeyi reddettin — öğüne eklenmeyecek.{" "}
                      <button
                        type="button"
                        className="font-medium text-emerald-600 underline"
                        onClick={() =>
                          setSelections((prev) => ({
                            ...prev,
                            [group.label]: group.candidates[0]?.food_id ?? "",
                          }))
                        }
                      >
                        Geri al
                      </button>
                    </p>
                  ) : (
                    <>
                      <div className="mt-2 space-y-2">
                        {group.candidates.map((candidate) => (
                          <label
                            key={candidate.food_id}
                            className={`flex items-center justify-between rounded-xl border p-3 text-sm ${
                              selections[group.label] === candidate.food_id
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-slate-200"
                            }`}
                          >
                            <span className="flex items-center">
                              <input
                                type="radio"
                                name={`candidate-${group.label}`}
                                className="mr-2"
                                checked={selections[group.label] === candidate.food_id}
                                onChange={() =>
                                  setSelections((prev) => ({
                                    ...prev,
                                    [group.label]: candidate.food_id,
                                  }))
                                }
                              />
                              {candidate.name}
                            </span>
                            <span className="text-xs text-slate-400">
                              {candidate.match_source === "USDA_FDC" ? "USDA" : "Yerel"}
                              {" · "}eşleşme %{Math.round(candidate.match_score * 100)}
                            </span>
                          </label>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <label className="flex-1 text-xs font-medium text-slate-600">
                          Gramaj (g)
                          <input
                            type="number"
                            min={1}
                            value={weights[group.label] ?? ""}
                            onChange={(e) =>
                              setWeights((prev) => ({
                                ...prev,
                                [group.label]: e.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRejectItem(group.label)}
                          className="mt-4 text-xs font-medium text-red-500"
                        >
                          Bu değil, çıkar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              <div>
                <label
                  htmlFor="mealType"
                  className="block text-sm font-medium text-slate-700"
                >
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
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleConfirmAll}
                disabled={Object.keys(selections).length === 0}
                className="w-full rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Seçilenleri Onayla ve Ekle
              </button>
            </div>
          )}

          {step === "submitting" && (
            <p className="mt-6 text-center text-sm text-slate-500">
              Kaydediliyor...
            </p>
          )}

          {step === "done" && (
            <div className="mt-6 space-y-3">
              {addedItems.length > 0 && (
                <>
                  <p className="text-center text-sm text-emerald-600">
                    {addedItems.length} yiyecek öğüne eklendi.
                  </p>
                  <div className="space-y-1 text-sm text-slate-600">
                    {addedItems.map((item) => (
                      <p key={item.label}>
                        <span className="font-medium">{item.foodName}</span> (
                        {item.weightG}g) — {item.nutrition.energy_kcal} kcal
                      </p>
                    ))}
                  </div>
                  <p className="text-center text-3xl font-bold">
                    {totals.energy_kcal} kcal
                  </p>
                  <p className="text-center text-sm text-slate-500">
                    Protein {totals.protein_g}g · Karbonhidrat{" "}
                    {totals.carbohydrates_g}g · Yağ {totals.fat_g}g · Fiber{" "}
                    {totals.fiber_g}g
                  </p>
                </>
              )}
              {submitErrors.length > 0 && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                  {submitErrors.map((e) => (
                    <p key={e}>{e}</p>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => router.push("/")}
                className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Ana sayfaya dön
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function mapAnalyzeError(status: number, errorCode?: string): string {
  if (status === 401) return "Devam etmek için giriş yapmalısın.";
  if (status === 429) return "Çok fazla istek gönderildi, biraz sonra tekrar dene.";
  if (status === 413) return "Görsel çok büyük.";
  if (status === 501) return "Fotoğraf analizi henüz aktif değil (AI sağlayıcısı bağlı değil).";
  if (status === 502) return "AI'nin döndürdüğü sonuç geçersiz görünüyor, farklı bir fotoğraf dene.";
  return errorCode ?? "Fotoğraf analiz edilemedi.";
}

function mapMealError(status: number, errorCode?: string): string {
  if (status === 401) return "Devam etmek için giriş yapmalısın.";
  if (status === 404) return "Bu besin için doğrulanmış nutrition verisi henüz yok.";
  if (status === 409) return "Bu öğün zaten eklenmiş.";
  return errorCode ?? "Öğün kaydedilemedi.";
}
