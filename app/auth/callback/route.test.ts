import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateSupabaseServerClient = vi.fn();
const mockExchangeCodeForSession = vi.fn();

vi.mock("@/lib/auth/supabaseServerClient", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

import { GET } from "./route";

beforeEach(() => {
  mockCreateSupabaseServerClient.mockReset();
  mockExchangeCodeForSession.mockReset();
  mockCreateSupabaseServerClient.mockResolvedValue({
    auth: { exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args) },
  });
});

/**
 * ADIM 30 — GERÇEK auth testinde bulunan hatanın regresyon testi: bu
 * route, `exchangeCodeForSession`'ın `error`'ını HİÇ kontrol etmeden her
 * durumda `/`'a yönlendiriyordu — PKCE `code_verifier` çerezi, onay
 * bağlantısı signup'ın başlatıldığı tarayıcıdan FARKLI bir tarayıcıda
 * açıldığında bulunamaz, exchange başarısız olur, ama kullanıcı yine de
 * "giriş yapmış gibi" `/`'a düşerdi (gerçekte HİÇBİR session oluşmadan).
 */
describe("GET /auth/callback", () => {
  it("başarılı callback: exchangeCodeForSession hatasızsa '/' adresine yönlendirir (mevcut davranış korunur)", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=valid-real-code"),
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("valid-real-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("code eksikse: exchangeCodeForSession HİÇ çağrılmaz, başarı sayfasına GİTMEZ", async () => {
    const response = await GET(new Request("http://localhost:3000/auth/callback"));

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/auth-code-error?reason=missing_code",
    );
    // KRİTİK regresyon: eski kod burada sessizce "/" döndürüyordu.
    expect(response.headers.get("location")).not.toBe("http://localhost:3000/");
  });

  it("PKCE code_verifier bulunamadığında (exchangeCodeForSession error döner): AÇIK hata sayfasına yönlendirir, '/' DEĞİL", async () => {
    // ADIM 30'da GERÇEKTEN gözlemlenen senaryo: onay linki farklı bir
    // tarayıcıda açıldı, code_verifier çerezi yok.
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "invalid request: both auth code and code verifier should be non-empty" },
    });

    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=some-code"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/auth-code-error?reason=exchange_failed",
    );
    // KRİTİK regresyon: eski kod burada da sessizce "/" döndürüyordu —
    // kullanıcı GERÇEKTE hiçbir session'ı olmadan "giriş yapmış" sanıyordu.
    expect(response.headers.get("location")).not.toBe("http://localhost:3000/");
  });

  it("geçersiz bir code ile exchangeCodeForSession reddedilirse de aynı şekilde hata sayfasına gider", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "invalid grant: code has already been used" },
    });

    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=already-used-code"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/auth-code-error?reason=exchange_failed",
    );
  });
});
