import { describe, expect, it } from "vitest";
import {
  photoAnalysisInputSchema,
  rawFoodRecognitionResultSchema,
} from "./foodRecognition";

describe("photoAnalysisInputSchema", () => {
  it("geçerli bir storage_path'i kabul eder", () => {
    const result = photoAnalysisInputSchema.safeParse({
      storage_path: "user-123/photo-abc.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("boş storage_path'i reddeder", () => {
    const result = photoAnalysisInputSchema.safeParse({ storage_path: "" });
    expect(result.success).toBe(false);
  });

  it("segment içermeyen (klasörsüz) bir storage_path'i reddeder", () => {
    const result = photoAnalysisInputSchema.safeParse({ storage_path: "photo.jpg" });
    expect(result.success).toBe(false);
  });

  it("path traversal denemesini (fazladan '/' içeren) reddeder", () => {
    const result = photoAnalysisInputSchema.safeParse({
      storage_path: "user-123/../other-user/photo.jpg",
    });
    expect(result.success).toBe(false);
  });

  it("aşırı uzun bir storage_path'i reddeder", () => {
    const result = photoAnalysisInputSchema.safeParse({
      storage_path: `user-123/${"a".repeat(600)}.jpg`,
    });
    expect(result.success).toBe(false);
  });
});

describe("rawFoodRecognitionResultSchema — AI çıktısı güvenlik doğrulaması", () => {
  const valid = {
    candidate_labels: [{ label: "grilled chicken breast", confidence: 0.9 }],
    estimated_weight_g: 150,
    visual_description: "A piece of grilled chicken.",
  };

  it("geçerli bir AI çıktısını kabul eder", () => {
    expect(rawFoodRecognitionResultSchema.safeParse(valid).success).toBe(true);
  });

  it("1'den büyük confidence'ı reddeder (manipüle edilmiş/saçma model çıktısı)", () => {
    const result = rawFoodRecognitionResultSchema.safeParse({
      ...valid,
      candidate_labels: [{ label: "x", confidence: 1000 }],
    });
    expect(result.success).toBe(false);
  });

  it("negatif confidence'ı reddeder", () => {
    const result = rawFoodRecognitionResultSchema.safeParse({
      ...valid,
      candidate_labels: [{ label: "x", confidence: -0.1 }],
    });
    expect(result.success).toBe(false);
  });

  it("gerçekçi olmayan büyüklükte estimated_weight_g'yi reddeder (prompt injection savunması)", () => {
    const result = rawFoodRecognitionResultSchema.safeParse({
      ...valid,
      estimated_weight_g: 50000,
    });
    expect(result.success).toBe(false);
  });

  it("negatif/sıfır estimated_weight_g'yi reddeder", () => {
    expect(
      rawFoodRecognitionResultSchema.safeParse({ ...valid, estimated_weight_g: 0 })
        .success,
    ).toBe(false);
    expect(
      rawFoodRecognitionResultSchema.safeParse({ ...valid, estimated_weight_g: -10 })
        .success,
    ).toBe(false);
  });

  it("10'dan fazla candidate_labels'ı reddeder (aşırı büyük yanıtla yorma savunması)", () => {
    const result = rawFoodRecognitionResultSchema.safeParse({
      ...valid,
      candidate_labels: Array.from({ length: 11 }, (_, i) => ({
        label: `food-${i}`,
        confidence: 0.5,
      })),
    });
    expect(result.success).toBe(false);
  });

  it("aşırı uzun visual_description'ı reddeder", () => {
    const result = rawFoodRecognitionResultSchema.safeParse({
      ...valid,
      visual_description: "x".repeat(2000),
    });
    expect(result.success).toBe(false);
  });

  it("boş candidate_labels dizisini kabul eder (tanınamayan besin senaryosu)", () => {
    const result = rawFoodRecognitionResultSchema.safeParse({
      ...valid,
      candidate_labels: [],
    });
    expect(result.success).toBe(true);
  });
});
