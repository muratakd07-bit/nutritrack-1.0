import type { DailyNutritionGoal } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DailyNutritionGoals, GoalSetBy } from "@/types/goals";

export interface CreateGoalParams extends DailyNutritionGoals {
  userId: string;
  setBy: GoalSetBy;
  setByTrainerId: string | null;
}

export const goalsRepository = {
  async getLatestForUser(userId: string): Promise<DailyNutritionGoal | null> {
    return prisma.dailyNutritionGoal.findFirst({
      where: { userId },
      orderBy: { effectiveFrom: "desc" },
    });
  },

  async createForUser(params: CreateGoalParams): Promise<DailyNutritionGoal> {
    return prisma.dailyNutritionGoal.create({
      data: {
        userId: params.userId,
        energyKcal: params.energy_kcal,
        proteinG: params.protein_g,
        carbohydratesG: params.carbohydrates_g,
        fatG: params.fat_g,
        fiberG: params.fiber_g,
        waterMl: params.water_ml,
        setBy: params.setBy,
        setByTrainerId: params.setByTrainerId,
      },
    });
  },

  async isTrainerAssignedToUser(
    trainerId: string,
    userId: string,
  ): Promise<boolean> {
    const assignment = await prisma.trainerAssignment.findUnique({
      where: {
        trainerId_clientUserId: { trainerId, clientUserId: userId },
      },
    });
    return assignment !== null;
  },
};
