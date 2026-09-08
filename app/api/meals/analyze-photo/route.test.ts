import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthenticatedUserId = vi.fn();
const mockAnalyzeFoodPhoto = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockDownloadMealPhotoAsBase64 = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUserId: () => mockGetAuthenticatedUserId(),
}));

vi.mock("@/lib/auth/supabaseServerClient", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/domain/nutrition/photoAnalysis", () => ({
  analyzeFoodPhoto: (...args: unknown[]) => mockAnalyzeFoodPhoto(...args),
}));

vi.mock("@/lib/storage/mealPhotos", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage/mealPhotos")>(
    "@/lib/storage/mealPhotos",
  );
  return {
    ...actual,
    downloadMealPhotoAsBase64: (...args: unknown[]) =>
      mockDownloadMealPhotoAsBase64(...args),
  };
});

import { resetRateLimitState } from "@/lib/rateLimit/simpleRateLimiter";
import { FoodRecognitionNotImplementedError } from "@/domain/nutrition/foodRecognition";
import { MealPhotoAccessError } from "@/lib/storage/mealPhotos";
import { ZodError, z } from "zod";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/meals/analyze-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const USER_ID = "user-1";
const VALID_BODY = { storage_path: `${USER_ID}/some-photo.jpg` };

const FAKE_PHOTO = { base64: "ZmFrZS1pbWFnZS1kYXRh", mimeType: "image/jpeg" };

const FAKE_ANALYSIS_RESULT = {
  candidates: [
    {
      food_id: "food-1",
      name: "Grilled Chicken",
      label: "grilled chicken breast",
      match_source: "LOCAL",
      match_score: 0.8,
      ai_confidence: 0.9,
    },
  ],
  estimated_weight_g: 150,
  visual_description: "desc",
  is_ambiguous: false,
  is_low_confidence: false,
  is_unrecognized: false,
};

beforeEach(() => {
  mockGetAuthenticatedUserId.mockReset();
  mockAnalyzeFoodPhoto.mockReset();
  mockCreateSupabaseServerClient.mockReset();
  mockDownloadMealPhotoAsBase64.mockReset();
  resetRateLimitState();

  mockGetAuthenticatedUserId.mockResolvedValue(USER_ID);
  mockCreateSupabaseServerClient.mockResolvedValue({ storage: {} });
  mockDownloadMealPhotoAsBase64.mockResolvedValue(FAKE_PHOTO);
  mockAnalyzeFoodPhoto.mockResolvedValue(FAKE_ANALYSIS_RESULT);
});

describe("POST /api/meals/analyze-photo", () => {
  it("oturum yoksa 401 döner (fail-closed, user isolation'ın önkoşulu)", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null);
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect(mockDownloadMealPhotoAsBase64).not.toHaveBeenCalled();
  });

  it("geçerli bir istekte analiz sonucunu döner", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(FAKE_ANALYSIS_RESULT);
    expect(mockDownloadMealPhotoAsBase64).toHaveBeenCalledWith(
      expect.anything(),
      VALID_BODY.storage_path,
    );
  });

  it("başka bir kullanıcının klasörüne ait bir storage_path'i 403 ile reddeder (Storage indirmeden ÖNCE)", async () => {
    const response = await POST(
      makeRequest({ storage_path: "some-other-user/photo.jpg" }),
    );
    expect(response.status).toBe(403);
    expect(mockDownloadMealPhotoAsBase64).not.toHaveBeenCalled();
  });

  it("geçersiz storage_path formatını (path traversal denemesi dahil) 400 ile reddeder", async () => {
    const response = await POST(
      makeRequest({ storage_path: `${USER_ID}/../other-user/photo.jpg` }),
    );
    expect(response.status).toBe(400);
    expect(mockDownloadMealPhotoAsBase64).not.toHaveBeenCalled();
  });

  it("fotoğraf bulunamazsa/RLS reddederse 404 döner (storage authorization)", async () => {
    mockDownloadMealPhotoAsBase64.mockRejectedValue(
      new MealPhotoAccessError(VALID_BODY.storage_path),
    );
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(404);
  });

  it("indirilen dosya çok büyükse 413 döner (upload limit)", async () => {
    mockDownloadMealPhotoAsBase64.mockResolvedValue({
      base64: "A".repeat(Math.ceil((9 * 1024 * 1024 * 4) / 3)),
      mimeType: "image/jpeg",
    });
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(413);
    expect(mockAnalyzeFoodPhoto).not.toHaveBeenCalled();
  });

  it("desteklenmeyen mime type'ı 400 ile reddeder", async () => {
    mockDownloadMealPhotoAsBase64.mockResolvedValue({
      base64: "ZmFrZQ==",
      mimeType: "application/pdf",
    });
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(400);
    expect(mockAnalyzeFoodPhoto).not.toHaveBeenCalled();
  });

  it("geçersiz JSON gövdesini 400 ile reddeder", async () => {
    const badRequest = new Request("http://localhost/api/meals/analyze-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });

  it("rate limit aşıldığında 429 döner (kullanıcı başına)", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(200);
    }
    const eleventh = await POST(makeRequest(VALID_BODY));
    expect(eleventh.status).toBe(429);
  });

  it("farklı kullanıcıların rate limit'i birbirinden bağımsızdır (user isolation)", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-a");
    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ storage_path: "user-a/photo.jpg" }));
    }
    const aBlocked = await POST(makeRequest({ storage_path: "user-a/photo.jpg" }));
    expect(aBlocked.status).toBe(429);

    mockGetAuthenticatedUserId.mockResolvedValue("user-b");
    const bStillAllowed = await POST(
      makeRequest({ storage_path: "user-b/photo.jpg" }),
    );
    expect(bStillAllowed.status).toBe(200);
  });

  it("AI sağlayıcısı bağlı değilse 501 döner", async () => {
    mockAnalyzeFoodPhoto.mockRejectedValue(new FoodRecognitionNotImplementedError());
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(501);
  });

  it("AI çıktısı geçersizse (zod hatası) 502 döner, çökmez", async () => {
    try {
      z.object({ x: z.number() }).parse({ x: "not-a-number" });
    } catch (e) {
      mockAnalyzeFoodPhoto.mockRejectedValue(e as ZodError);
    }
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(502);
  });
});
