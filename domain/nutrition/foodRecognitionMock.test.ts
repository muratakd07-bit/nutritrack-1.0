import { describe, expect, it } from "vitest";
import { createDeterministicMockSource } from "./foodRecognitionMock";

describe("createDeterministicMockSource", () => {
  it("aynı girdi için her zaman aynı sonucu döner (deterministik)", async () => {
    const input = { image_base64: "abcdefgh", mime_type: "image/jpeg" };
    const first = await createDeterministicMockSource(input).recognizeFood();
    const second = await createDeterministicMockSource(input).recognizeFood();
    expect(first).toEqual(second);
  });

  it("farklı uzunluktaki girdiler farklı sonuçlar üretebilir", async () => {
    const a = await createDeterministicMockSource({
      image_base64: "a",
      mime_type: "image/jpeg",
    }).recognizeFood();
    const b = await createDeterministicMockSource({
      image_base64: "abcdefghijklmnop",
      mime_type: "image/jpeg",
    }).recognizeFood();
    // Zorunlu değil ama en azından tip/şekil olarak geçerli olmalı.
    expect(a.candidate_labels.length).toBeGreaterThan(0);
    expect(b.candidate_labels.length).toBeGreaterThan(0);
  });

  it("her zaman şema-geçerli bir sonuç üretir", async () => {
    const { rawFoodRecognitionResultSchema } = await import(
      "@/lib/validation/foodRecognition"
    );
    const result = await createDeterministicMockSource({
      image_base64: "test",
      mime_type: "image/jpeg",
    }).recognizeFood();
    expect(() => rawFoodRecognitionResultSchema.parse(result)).not.toThrow();
  });
});
