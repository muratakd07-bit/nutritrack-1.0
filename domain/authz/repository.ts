import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/types/authz";

export const authzRepository = {
  /** Rol bilgisinin TEK veri kaynağı. */
  async getUserRole(userId: string): Promise<UserRole | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return (user?.role as UserRole | undefined) ?? null;
  },

  async getTrainerProfileIdForUser(userId: string): Promise<string | null> {
    const trainer = await prisma.trainer.findUnique({
      where: { userId },
      select: { id: true },
    });
    return trainer?.id ?? null;
  },

  async isTrainerAssignmentActive(
    trainerId: string,
    clientUserId: string,
  ): Promise<boolean> {
    const assignment = await prisma.trainerAssignment.findUnique({
      where: { trainerId_clientUserId: { trainerId, clientUserId } },
    });
    return assignment !== null;
  },

  async listAssignedClientIds(trainerId: string): Promise<string[]> {
    const rows = await prisma.trainerAssignment.findMany({
      where: { trainerId },
      select: { clientUserId: true },
    });
    return rows.map((row) => row.clientUserId);
  },

  /** Trainer profili yoksa oluşturur, sonra atamayı ekler (idempotent). */
  async createTrainerAssignment(
    trainerUserId: string,
    clientUserId: string,
  ): Promise<void> {
    const trainer = await prisma.trainer.upsert({
      where: { userId: trainerUserId },
      create: { userId: trainerUserId },
      update: {},
    });

    await prisma.trainerAssignment.upsert({
      where: {
        trainerId_clientUserId: { trainerId: trainer.id, clientUserId },
      },
      create: { trainerId: trainer.id, clientUserId },
      update: {},
    });
  },
};
