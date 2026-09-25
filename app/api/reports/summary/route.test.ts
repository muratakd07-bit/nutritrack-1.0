import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthenticatedUserId = vi.fn();
const mockRequireAccessToUserData = vi.fn();
const mockGetCurrentGoalsForUser = vi.fn();
const mockGetDailySummariesForUser = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUserId: () => mockGetAuthenticatedUserId(),
}));

vi.mock("@/domain/authz/service", async () => {
  const actual = await vi.importActual<typeof import("@/domain/authz/service")>(
    "@/domain/authz/service",
  );
  return {
    ...actual,
    requireAccessToUserData: (...args: unknown[]) => mockRequireAccessToUserData(...args),
  };
});

vi.mock("@/domain/goals/service", async () => {
  const actual = await vi.importActual<typeof import("@/domain/goals/service")>(
    "@/domain/goals/service",
  );
  return {
    ...actual,
    getCurrentGoalsForUser: (...args: unknown[]) => mockGetCurrentGoalsForUser(...args),
  };
});

vi.mock("@/domain/reports/dailySummary", () => ({
  getDailySummariesForUser: (...args: unknown[]) => mockGetDailySummariesForUser(...args),
}));

import { ForbiddenError } from "@/domain/authz/service";
import { GET } from "./route";

function call(query: string) {
  return GET(new Request(`http://localhost/api/reports/summary${query}`));
}

beforeEach(() => {
  mockGetAuthenticatedUserId.mockReset();
  mockRequireAccessToUserData.mockReset();
  mockGetCurrentGoalsForUser.mockReset();
  mockGetDailySummariesForUser.mockReset();
  mockGetAuthenticatedUserId.mockResolvedValue("user-1");
  mockGetCurrentGoalsForUser.mockResolvedValue(null);
  mockGetDailySummariesForUser.mockResolvedValue([]);
});

describe("GET /api/reports/summary", () => {
  it("oturum yoksa 401 döner", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null);
    expect((await call("")).status).toBe(401);
  });

  it("geçersiz date/days için 400 döner", async () => {
    expect((await call("?date=2026-02-30")).status).toBe(400);
    expect((await call("?days=0")).status).toBe(400);
    expect((await call("?days=32")).status).toBe(400);
    expect((await call("?days=1.5")).status).toBe(400);
    expect(mockGetDailySummariesForUser).not.toHaveBeenCalled();
  });

  it("kendi verisi için yetki kontrolü yapmadan özet ve hedefleri döner", async () => {
    mockGetCurrentGoalsForUser.mockResolvedValue({
      id: "goal-1",
      userId: "user-1",
      energyKcal: 2200,
      proteinG: 160,
      carbohydratesG: 220,
      fatG: 70,
      fiberG: 30,
      waterMl: 2500,
      setBy: "TRAINER",
      setByTrainerId: "trainer-1",
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    });

    const response = await call("?date=2026-09-25&days=7");

    expect(response.status).toBe(200);
    expect(mockRequireAccessToUserData).not.toHaveBeenCalled();
    const [userId, endDate, days] = mockGetDailySummariesForUser.mock.calls[0];
    expect(userId).toBe("user-1");
    expect((endDate as Date).toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect(days).toBe(7);
    const body = await response.json();
    expect(body.data.goals).toMatchObject({ energy_kcal: 2200, protein_g: 160, set_by: "TRAINER" });
  });

  it("başka bir kullanıcının verisine yetkisiz erişimde 403 döner", async () => {
    mockRequireAccessToUserData.mockRejectedValue(new ForbiddenError("no"));
    const response = await call("?user_id=user-2");
    expect(response.status).toBe(403);
    expect(mockGetDailySummariesForUser).not.toHaveBeenCalled();
  });
});
