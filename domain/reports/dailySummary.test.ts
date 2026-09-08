import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAggregate = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    mealItem: {
      aggregate: (...args: unknown[]) => mockAggregate(...args),
    },
  },
}));

import { getDailySummaryForUser } from "./dailySummary";

beforeEach(() => {
  mockAggregate.mockReset();
});

describe("getDailySummaryForUser", () => {
  it("birden fazla meal item'ın ZATEN HESAPLANMIŞ değerlerini toplar", async () => {
    mockAggregate.mockResolvedValue({
      _sum: {
        energyKcal: 450,
        proteinG: 35,
        carbohydratesG: 50,
        fatG: 15,
        fiberG: 8,
      },
      _count: 3,
    });

    const result = await getDailySummaryForUser("user-1", new Date("2026-01-01"));

    expect(result).toEqual({
      energy_kcal: 450,
      protein_g: 35,
      carbohydrates_g: 50,
      fat_g: 15,
      fiber_g: 8,
      item_count: 3,
    });
  });

  it("hiç meal item yoksa sıfır döner (null toplam değil)", async () => {
    mockAggregate.mockResolvedValue({
      _sum: {
        energyKcal: null,
        proteinG: null,
        carbohydratesG: null,
        fatG: null,
        fiberG: null,
      },
      _count: 0,
    });

    const result = await getDailySummaryForUser("user-1", new Date("2026-01-01"));

    expect(result).toEqual({
      energy_kcal: 0,
      protein_g: 0,
      carbohydrates_g: 0,
      fat_g: 0,
      fiber_g: 0,
      item_count: 0,
    });
  });

  it("yalnızca çağrılan userId ile scope'lu sorgu yapar (user isolation)", async () => {
    mockAggregate.mockResolvedValue({
      _sum: { energyKcal: 0, proteinG: 0, carbohydratesG: 0, fatG: 0, fiberG: 0 },
      _count: 0,
    });

    await getDailySummaryForUser("user-42", new Date("2026-01-01"));

    const callArgs = mockAggregate.mock.calls[0][0];
    expect(callArgs.where.userId).toBe("user-42");
    expect(callArgs.where.status).toBe("ACTIVE");
  });
});
