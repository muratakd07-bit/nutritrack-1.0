"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
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
}

interface PhotoAnalysisResult {
  candidates: AnalyzedCandidate[];
  estimated_weight_g: number;
  visual_description: string;
  is_ambiguous: boolean;
  is_low_confidence: boolean;
  is_unrecognized: boolean;
}

type Step = "upload" | "uploading" | "analyzing" | "review" | "submitting" | "done";

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export default function AddPhotoPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysisResult | null>(null);

  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [weightG, setWeightG] = useState<number>(0);
  const [mealType, setMealType] = useState<MealType>("SNACK");
  const [nutritionResult, setNutritionResult] = useState<CalculatedNutrition | null>(null);

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
      setWeightG(result.estimated_weight_g);
      setSelectedFoodId(result.candidates[0]?.food_id ?? null);
      setStep("review");
    } catch {
      setError("Fotoğraf analiz edilirken bir hata oluştu.");
      setStep("upload");
    }
  }

  async function handleConfirm() {
    if (!selectedFoodId || weightG <= 0) {
      setError("Lütfen bir besin seç ve geçerli bir gramaj gir.");
      return;
    }

    setError(null);
    setStep("submitting");

    try {
      const response = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food_id: selectedFoodId,
          consumed_weight_g: weightG,
          meal_type: mealType,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(mapMealError(response.status, body?.error));
        setStep("review");
        return;
      }

      setNutritionResult({
        energy_kcal: body.data.energyKcal,
        protein_g: body.data.proteinG,
        carbohydrates_g: body.data.carbohydratesG,
        fat_g: body.data.fatG,
        fiber_g: body.data.fiberG,
      });
      setStep("done");
    } catch {
      setError("Öğün kaydedilirken bir hata oluştu.");
      setStep("review");
    }
  }

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

              {analysis.is_unrecognized && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  Besin tanınamadı. Aşağıdan manuel olarak devam edebilir ya da
                  farklı bir fotoğraf deneyebilirsin.
                </p>
              )}
              {analysis.is_ambiguous && !analysis.is_unrecognized && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  Birden fazla olası besin var — lütfen doğru olanı seç.
                </p>
              )}
              {analysis.is_low_confidence && !analysis.is_unrecognized && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  Bu tahminin güveni düşük — lütfen dikkatlice kontrol et.
                </p>
              )}

              {analysis.candidates.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Bu doğru mu?
                  </p>
                  <div className="mt-2 space-y-2">
                    {analysis.candidates.map((candidate) => (
                      <label
                        key={candidate.food_id}
                        className={`flex items-center justify-between rounded-xl border p-3 text-sm ${
                          selectedFoodId === candidate.food_id
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-200"
                        }`}
                      >
                        <span>
                          <input
                            type="radio"
                            name="candidate"
                            className="mr-2"
                            checked={selectedFoodId === candidate.food_id}
                            onChange={() => setSelectedFoodId(candidate.food_id)}
                          />
                          {candidate.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          %{Math.round(candidate.ai_confidence * 100)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="weight"
                  className="block text-sm font-medium text-slate-700"
                >
                  Gramaj (g) — AI tahmini: {analysis.estimated_weight_g}g, gerekirse düzelt
                </label>
                <input
                  id="weight"
                  type="number"
                  min={1}
                  value={weightG}
                  onChange={(e) => setWeightG(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

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
                onClick={handleConfirm}
                disabled={!selectedFoodId}
                className="w-full rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Onayla
              </button>
            </div>
          )}

          {step === "submitting" && (
            <p className="mt-6 text-center text-sm text-slate-500">
              Kaydediliyor...
            </p>
          )}

          {step === "done" && nutritionResult && (
            <div className="mt-6 space-y-3 text-center">
              <p className="text-sm text-emerald-600">Öğüne eklendi.</p>
              <p className="text-3xl font-bold">
                {nutritionResult.energy_kcal} kcal
              </p>
              <p className="text-sm text-slate-500">
                Protein {nutritionResult.protein_g}g · Karbonhidrat{" "}
                {nutritionResult.carbohydrates_g}g · Yağ {nutritionResult.fat_g}g ·
                Fiber {nutritionResult.fiber_g}g
              </p>
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
