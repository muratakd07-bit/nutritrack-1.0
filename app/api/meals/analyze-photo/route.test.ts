import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthenticatedUserId = vi.fn();
const mockAnalyzeFoodPhoto = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUserId: () => mockGetAuthenticatedUserId(),
}));

vi.mock("@/domain/nutrition/photoAnalysis", () => ({
  analyzeFoodPhoto: (...args: unknown[]) => mockAnalyzeFoodPhoto(...args),
}));

import { resetRateLimitState } from "@/lib/rateLimit/simpleRateLimiter";
import { FoodRecognitionNotImplementedError } from "@/domain/nutrition/foodRecognition";
import { ZodError, z } from "zod";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/meals/analyze-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  image_base64: "aGVsbG8td29ybGQ=",
  mime_type: "image/jpeg",
};

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
  resetRateLimitState();
});

describe("POST /api/meals/analyze-photo", () => {
  it("oturum yoksa 401 döner (fail-closed, user isolation'ın önkoşulu)", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null);
    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(401);
    expect(mockAnalyzeFoodPhoto).not.toHaveBeenCalled();
  });

  it("geçerli bir istekte analiz sonucunu döner", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockAnalyzeFoodPhoto.mockResolvedValue(FAKE_ANALYSIS_RESULT);

    const response = await POST(makeRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(FAKE_ANALYSIS_RESULT);
  });

  it("desteklenmeyen mime_type'ı 400 ile reddeder (upload validation)", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    const response = await POST(
      makeRequest({ ...VALID_BODY, mime_type: "application/pdf" }),
    );
    expect(response.status).toBe(400);
    expect(mockAnalyzeFoodPhoto).not.toHaveBeenCalled();
  });

  it("çok büyük bir görseli 413 ile reddeder (upload size validation)", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    // ~9MB'lık base64 (limit 8MB).
    const hugeBase64 = "A".repeat(Math.ceil((9 * 1024 * 1024 * 4) / 3));
    const response = await POST(
      makeRequest({ image_base64: hugeBase64, mime_type: "image/jpeg" }),
    );
    expect(response.status).toBe(413);
    expect(mockAnalyzeFoodPhoto).not.toHaveBeenCalled();
  });

  it("geçersiz JSON gövdesini 400 ile reddeder", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    const badRequest = new Request("http://localhost/api/meals/analyze-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });

  it("rate limit aşıldığında 429 döner (kullanıcı başına)", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-rate-limited");
    mockAnalyzeFoodPhoto.mockResolvedValue(FAKE_ANALYSIS_RESULT);

    // Route içindeki limit: 10 istek/dakika. 10 tanesi geçmeli, 11.'si reddedilmeli.
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(200);
    }
    const eleventh = await POST(makeRequest(VALID_BODY));
    expect(eleventh.status).toBe(429);
  });

  it("farklı kullanıcıların rate limit'i birbirinden bağımsızdır (user isolation)", async () => {
    mockAnalyzeFoodPhoto.mockResolvedValue(FAKE_ANALYSIS_RESULT);

    mockGetAuthenticatedUserId.mockResolvedValue("user-a");
    for (let i = 0; i < 10; i++) await POST(makeRequest(VALID_BODY));
    const aBlocked = await POST(makeRequest(VALID_BODY));
    expect(aBlocked.status).toBe(429);

    mockGetAuthenticatedUserId.mockResolvedValue("user-b");
    const bStillAllowed = await POST(makeRequest(VALID_BODY));
    expect(bStillAllowed.status).toBe(200);
  });

  it("AI sağlayıcısı bağlı değilse 501 döner", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockAnalyzeFoodPhoto.mockRejectedValue(new FoodRecognitionNotImplementedError());

    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(501);
  });

  it("AI çıktısı geçersizse (zod hatası) 502 döner, çökme", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    try {
      z.object({ x: z.number() }).parse({ x: "not-a-number" });
    } catch (e) {
      mockAnalyzeFoodPhoto.mockRejectedValue(e as ZodError);
    }

    const response = await POST(makeRequest(VALID_BODY));
    expect(response.status).toBe(502);
  });
});
