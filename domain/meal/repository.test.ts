import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateMany = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    mealItem: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { mealRepository } from "./repository";

beforeEach(() => {
  mockUpdateMany.mockReset();
  mockFindMany.mockReset();
});

describe("mealRepository.softDeleteMealItemForUser", () => {
  it("silme koşuluna userId'yi dahil eder ve kaydı yalnızca DELETED yapar", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await mealRepository.softDeleteMealItemForUser("user-1", "item-1");

    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "item-1", userId: "user-1", status: "ACTIVE" },
      data: { status: "DELETED" },
    });
  });

  it("hiçbir satır etkilenmezse (başkasının kaydı / zaten silinmiş) false döner", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    expect(await mealRepository.softDeleteMealItemForUser("user-1", "item-x")).toBe(false);
  });
});

describe("mealRepository.listMealItemsWithFoodForUser", () => {
  it("userId ve ACTIVE ile scope'lanır, besin adını dahil eder", async () => {
    mockFindMany.mockResolvedValue([]);
    const from = new Date("2026-09-25T00:00:00.000Z");
    const to = new Date("2026-09-26T00:00:00.000Z");

    await mealRepository.listMealItemsWithFoodForUser("user-1", { from, to });

    const args = mockFindMany.mock.calls[0][0];
    expect(args.where).toEqual({
      userId: "user-1",
      status: "ACTIVE",
      meal: { consumedAt: { gte: from, lt: to } },
    });
    expect(args.include).toEqual({ food: { select: { name: true } } });
  });
});
