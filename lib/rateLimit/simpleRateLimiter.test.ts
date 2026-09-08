import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimitState } from "./simpleRateLimiter";

beforeEach(() => {
  resetRateLimitState();
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("limit altındaki istekleri kabul eder", () => {
    expect(checkRateLimit("user-1", 3, 60_000)).toBe(true);
    expect(checkRateLimit("user-1", 3, 60_000)).toBe(true);
    expect(checkRateLimit("user-1", 3, 60_000)).toBe(true);
  });

  it("limiti aşan isteği reddeder", () => {
    checkRateLimit("user-1", 2, 60_000);
    checkRateLimit("user-1", 2, 60_000);
    expect(checkRateLimit("user-1", 2, 60_000)).toBe(false);
  });

  it("farklı key'ler birbirinden bağımsızdır (user isolation)", () => {
    checkRateLimit("user-a", 1, 60_000);
    expect(checkRateLimit("user-a", 1, 60_000)).toBe(false);
    expect(checkRateLimit("user-b", 1, 60_000)).toBe(true);
  });

  it("pencere süresi dolunca sayaç sıfırlanır", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    checkRateLimit("user-1", 1, 1000);
    expect(checkRateLimit("user-1", 1, 1000)).toBe(false);

    vi.setSystemTime(1500);
    expect(checkRateLimit("user-1", 1, 1000)).toBe(true);
    vi.useRealTimers();
  });
});
