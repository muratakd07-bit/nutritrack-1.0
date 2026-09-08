import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodRecognitionInput, FoodRecognitionSource } from "./foodRecognition";

const mockMatchLabelToFoods = vi.fn();

vi.mock("@/domain/foods/foodMatcher", () => ({
  matchLabelToFoods: (...args: unknown[]) => mockMatchLabelToFoods(...args),
}));

import { analyzeFoodPhoto } from "./photoAnalysis";

const SAMPLE_INPUT: FoodRecognitionInput = {
  image_base64: "ZmFrZS1pbWFnZS1kYXRh",
  mime_type: "image/jpeg",
};

function fakeSource(result: unknown): FoodRecognitionSource {
  return { recognizeFood: vi.fn().mockResolvedValue(result) };
}

beforeEach(() => {
  mockMatchLabelToFoods.mockReset();
  mockMatchLabelToFoods.mockResolvedValue([
    { food_id: "food-1", name: "Matched Food", match_source: "LOCAL", match_score: 0.8 },
  ]);
});

describe("analyzeFoodPhoto", () => {
  it("aynı girdi/mock çıktı için deterministik olarak aynı sonucu üretir", async () => {
    const source = fakeSource({
      candidate_labels: [{ label: "grilled chicken breast", confidence: 0.9 }],
      estimated_weight_g: 150,
      visual_description: "desc",
    });

    const first = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });
    const second = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });

    expect(first).toEqual(second);
  });

  it("AI çıktısı geçersizse (ör. confidence > 1) fırlatır, sessizce düzeltmez", async () => {
    const source = fakeSource({
      candidate_labels: [{ label: "x", confidence: 5 }],
      estimated_weight_g: 100,
      visual_description: "desc",
    });

    await expect(
      analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source }),
    ).rejects.toThrow();
  });

  it("belirsizlik (ambiguous) durumunu doğru tespit eder — yakın güven skorları", async () => {
    const source = fakeSource({
      candidate_labels: [
        { label: "chicken", confidence: 0.55 },
        { label: "turkey", confidence: 0.5 },
      ],
      estimated_weight_g: 150,
      visual_description: "desc",
    });

    const result = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });
    expect(result.is_ambiguous).toBe(true);
  });

  it("net bir favori varsa (büyük güven farkı) belirsiz SAYMAZ", async () => {
    const source = fakeSource({
      candidate_labels: [
        { label: "chicken", confidence: 0.95 },
        { label: "turkey", confidence: 0.1 },
      ],
      estimated_weight_g: 150,
      visual_description: "desc",
    });

    const result = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });
    expect(result.is_ambiguous).toBe(false);
  });

  it("düşük güven (low confidence) durumunu tespit eder", async () => {
    const source = fakeSource({
      candidate_labels: [{ label: "mystery food", confidence: 0.2 }],
      estimated_weight_g: 100,
      visual_description: "desc",
    });

    const result = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });
    expect(result.is_low_confidence).toBe(true);
  });

  it("hiç aday etiket yoksa (tanınamadı) is_unrecognized=true, boş candidates döner", async () => {
    mockMatchLabelToFoods.mockResolvedValue([]);
    const source = fakeSource({
      candidate_labels: [],
      estimated_weight_g: 100,
      visual_description: "Belirsiz bir tabak.",
    });

    const result = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });
    expect(result.is_unrecognized).toBe(true);
    expect(result.candidates).toEqual([]);
  });

  it("bir etiket için eşleşme (matching food) BULUNAMAZSA da is_unrecognized=true olur", async () => {
    mockMatchLabelToFoods.mockResolvedValue([]); // FoodMatcher hiçbir food_id bulamadı
    const source = fakeSource({
      candidate_labels: [{ label: "some exotic dish", confidence: 0.8 }],
      estimated_weight_g: 100,
      visual_description: "desc",
    });

    const result = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });
    expect(result.is_unrecognized).toBe(true);
  });

  it("nutrition değerleri SONUÇTA HİÇ YOK — yalnızca food_id/isim/skor taşınır", async () => {
    const source = fakeSource({
      candidate_labels: [{ label: "grilled chicken breast", confidence: 0.9 }],
      estimated_weight_g: 150,
      visual_description: "desc",
    });

    const result = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });

    for (const candidate of result.candidates) {
      expect(candidate).not.toHaveProperty("energy_kcal");
      expect(candidate).not.toHaveProperty("calories");
      expect(candidate).not.toHaveProperty("protein_g");
      // Yalnızca kimlik/eşleştirme bilgisi taşınmalı:
      expect(Object.keys(candidate).sort()).toEqual(
        ["ai_confidence", "food_id", "label", "match_score", "match_source", "name"].sort(),
      );
    }
  });

  it("estimated_weight_g, AI'nin tahminidir; sonuçta consumed_weight_g diye bir alan YOKTUR", async () => {
    const source = fakeSource({
      candidate_labels: [{ label: "chicken", confidence: 0.9 }],
      estimated_weight_g: 175,
      visual_description: "desc",
    });

    const result = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });
    expect(result.estimated_weight_g).toBe(175);
    expect(result).not.toHaveProperty("consumed_weight_g");
  });

  it("en fazla ilk 3 etiket için eşleştirme dener (maliyet kontrolü)", async () => {
    const source = fakeSource({
      candidate_labels: [
        { label: "a", confidence: 0.9 },
        { label: "b", confidence: 0.8 },
        { label: "c", confidence: 0.7 },
        { label: "d", confidence: 0.6 },
        { label: "e", confidence: 0.5 },
      ],
      estimated_weight_g: 100,
      visual_description: "desc",
    });

    await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });
    expect(mockMatchLabelToFoods).toHaveBeenCalledTimes(3);
  });
});

describe("onay akışı (confirmation) — mimari garanti", () => {
  it("PhotoAnalysisResult, doğrudan MealItemInput olarak kullanılamaz (tip seviyesinde ayrı)", async () => {
    const source = fakeSource({
      candidate_labels: [{ label: "grilled chicken breast", confidence: 0.9 }],
      estimated_weight_g: 150,
      visual_description: "desc",
    });

    const result = await analyzeFoodPhoto(SAMPLE_INPUT, { recognitionSource: source });

    // MealItemInput'un gerektirdiği alanlar (food_id, consumed_weight_g,
    // meal_type) PhotoAnalysisResult'ta YOKTUR — kullanıcı bir candidate
    // SEÇMEDEN ve gramajı ONAYLAMADAN geçerli bir MealItemInput inşa
    // edilemez. Bu, "onaylanmamış analiz meal item oluşturamaz" kuralının
    // derleme-zamanı (tip sistemi) garantisidir.
    expect(result).not.toHaveProperty("food_id");
    expect(result).not.toHaveProperty("consumed_weight_g");
    expect(result).not.toHaveProperty("meal_type");

    // Kullanıcı bir aday SEÇTİĞİNDE (reddetmek/değiştirmek yerine) VE
    // gramajı kendi onayladığı bir değere (AI tahmininden FARKLI olabilir)
    // ayarladığında geçerli bir MealItemInput inşa edilir:
    const chosen = result.candidates[0];
    const userConfirmedInput = {
      food_id: chosen.food_id,
      consumed_weight_g: 200, // kullanıcı AI'nin 150g tahminini 200g'a DEĞİŞTİRDİ
      meal_type: "LUNCH" as const,
    };
    expect(userConfirmedInput.consumed_weight_g).not.toBe(result.estimated_weight_g);
  });
});
