import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateForUser = vi.fn();
const mockResolveAssignedTrainerId = vi.fn();

vi.mock("./repository", () => ({
  goalsRepository: {
    getLatestForUser: vi.fn(),
    createForUser: (...args: unknown[]) => mockCreateForUser(...args),
  },
}));

vi.mock("@/domain/authz/service", () => ({
  resolveAssignedTrainerId: (...args: unknown[]) =>
    mockResolveAssignedTrainerId(...args),
}));

import { setGoalsForUser, UnauthorizedGoalWriteError } from "./service";
import type { DailyNutritionGoals } from "@/types/goals";

const sampleGoals: DailyNutritionGoals = {
  energy_kcal: 2200,
  protein_g: 160,
  carbohydrates_g: 220,
  fat_g: 70,
  fiber_g: 30,
  water_ml: 2500,
};

beforeEach(() => {
  mockCreateForUser.mockReset();
  mockResolveAssignedTrainerId.mockReset();
  mockCreateForUser.mockResolvedValue({ id: "goal-1" });
});

describe("setGoalsForUser — yalnızca trainer/system yazabilir", () => {
  it("SYSTEM aktörü her zaman yazabilir", async () => {
    await setGoalsForUser("user-1", sampleGoals, { type: "SYSTEM" });
    expect(mockCreateForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        setBy: "SYSTEM",
        setByTrainerId: null,
      }),
    );
  });

  it("kullanıcıya atanmamış bir trainer'ı reddeder (authz katmanı null döner)", async () => {
    mockResolveAssignedTrainerId.mockResolvedValue(null);

    await expect(
      setGoalsForUser("user-1", sampleGoals, {
        type: "TRAINER",
        trainerUserId: "trainer-user-1",
      }),
    ).rejects.toThrow(UnauthorizedGoalWriteError);

    expect(mockCreateForUser).not.toHaveBeenCalled();
  });

  it("kullanıcıya atanmış bir trainer'a yazma izni verir", async () => {
    mockResolveAssignedTrainerId.mockResolvedValue("trainer-profile-1");

    await setGoalsForUser("user-1", sampleGoals, {
      type: "TRAINER",
      trainerUserId: "trainer-user-1",
    });

    expect(mockResolveAssignedTrainerId).toHaveBeenCalledWith(
      "trainer-user-1",
      "user-1",
    );
    expect(mockCreateForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        setBy: "TRAINER",
        setByTrainerId: "trainer-profile-1",
      }),
    );
  });
});
