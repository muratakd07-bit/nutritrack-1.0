import { describe, expect, it } from "vitest";
import {
  foodRecognitionSource,
  FoodRecognitionNotImplementedError,
} from "./foodRecognition";

describe("foodRecognitionSource (varsayılan/production implementasyon)", () => {
  it("henüz bir AI sağlayıcısı bağlanmadığı için NotImplementedError fırlatır", async () => {
    await expect(
      foodRecognitionSource.recognizeFood({ image_ref: "test-image" }),
    ).rejects.toThrow(FoodRecognitionNotImplementedError);
  });
});
