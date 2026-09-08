import { describe, expect, it } from "vitest";
import {
  foodRecognitionSource,
  FoodRecognitionNotImplementedError,
} from "./foodRecognition";

describe("foodRecognitionSource (varsayılan/production implementasyon)", () => {
  it("QWEN3_VL_ENDPOINT_URL tanımlı olmadığı için NotImplementedError fırlatır", async () => {
    expect(process.env.QWEN3_VL_ENDPOINT_URL).toBeUndefined();
    await expect(
      foodRecognitionSource.recognizeFood({
        image_base64: "test-image-data",
        mime_type: "image/jpeg",
      }),
    ).rejects.toThrow(FoodRecognitionNotImplementedError);
  });
});
