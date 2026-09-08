import { describe, expect, it } from "vitest";
import {
  foodRecognitionSource,
  FoodRecognitionNotImplementedError,
} from "./foodRecognition";

describe("foodRecognitionSource (varsayılan/production implementasyon)", () => {
  it("QWEN3_VL_BASE_URL/QWEN3_VL_API_KEY tanımlı olmadığı için NotImplementedError fırlatır", async () => {
    expect(process.env.QWEN3_VL_BASE_URL).toBeUndefined();
    expect(process.env.QWEN3_VL_API_KEY).toBeUndefined();
    await expect(
      foodRecognitionSource.recognizeFood({
        image_base64: "test-image-data",
        mime_type: "image/jpeg",
      }),
    ).rejects.toThrow(FoodRecognitionNotImplementedError);
  });
});
