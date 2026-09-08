/**
 * Minimal, bellek-içi (in-memory) sabit-pencere rate limiter.
 *
 * SINIRLAMA (dürüstçe belirtilmiş): Bu implementasyon yalnızca TEK bir
 * process/instance içinde çalışır. Serverless/çok-instance bir production
 * ortamında (ör. Vercel'de her istek farklı bir instance'a gidebilir) bu
 * limit GÜVENİLİR ŞEKİLDE UYGULANMAZ — gerçek çok-instance production için
 * paylaşılan bir store (ör. Redis, Upstash) gerekir. Bu proje henüz böyle
 * bir altyapıya sahip değil; bu limiter "hiç limit olmamasından iyi" bir
 * ilk savunma katmanı olarak eklendi (ör. AI sağlayıcı maliyetine karşı
 * kaba bir kötüye kullanım freni).
 */

interface WindowState {
  count: number;
  windowStartMs: number;
}

const state = new Map<string, WindowState>();

/**
 * `key` için `windowMs` süresinde en fazla `maxRequests` isteğe izin verir.
 * Limit aşılmadıysa `true`, aşıldıysa `false` döner.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = state.get(key);

  if (!entry || now - entry.windowStartMs >= windowMs) {
    state.set(key, { count: 1, windowStartMs: now });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

/** Yalnızca testler için — global durumu sıfırlar. */
export function resetRateLimitState(): void {
  state.clear();
}
