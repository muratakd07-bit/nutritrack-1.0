import { Prisma, type MealItem } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { startOfDayUTC, endOfDayUTC } from "@/lib/utils/date";
import type { MealType } from "@/types/meal";
import type { CalculatedNutrition } from "@/types/nutrition";

/**
 * Prisma tabanlı veri erişim katmanı. KURAL: buradaki her sorgu `userId` ile
 * scope'lanmalıdır — bir kullanıcının başka bir kullanıcının kaydına
 * erişebileceği hiçbir sorgu yazılmamalıdır (user isolation).
 */

export interface CreateMealItemParams {
  userId: string;
  foodId: string;
  consumedWeightG: number;
  mealType: MealType;
  consumedAt?: Date;
  calculatedNutrition: CalculatedNutrition;
  idempotencyKey?: string;
}

/** Benzersiz idempotency-key ihlali için Prisma hata kodu. */
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

export class IdempotencyKeyConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(`idempotency_key zaten kullanımda: ${idempotencyKey}`);
    this.name = "IdempotencyKeyConflictError";
  }
}

async function findOrCreateMealContainer(
  userId: string,
  mealType: MealType,
  consumedAt: Date,
) {
  const existing = await prisma.meal.findFirst({
    where: {
      userId,
      mealType,
      status: "ACTIVE",
      consumedAt: { gte: startOfDayUTC(consumedAt), lt: endOfDayUTC(consumedAt) },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.meal.create({
    data: { userId, mealType, consumedAt },
  });
}

export const mealRepository = {
  /**
   * `idempotencyKey` bu kullanıcıya ait daha önce oluşturulmuş bir kayda
   * karşılık geliyorsa onu döndürür. Kayıt başka bir kullanıcıya aitse
   * (ekstrem/olmaması gereken bir çakışma durumu) `null` döner — asla başka
   * bir kullanıcının verisi sızdırılmaz.
   */
  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<MealItem | null> {
    const existing = await prisma.mealItem.findUnique({
      where: { idempotencyKey },
    });
    if (!existing || existing.userId !== userId) {
      return null;
    }
    return existing;
  },

  async createMealItem(params: CreateMealItemParams): Promise<MealItem> {
    const consumedAt = params.consumedAt ?? new Date();

    try {
      return await prisma.$transaction(async (tx) => {
        const meal = await findOrCreateMealContainer(
          params.userId,
          params.mealType,
          consumedAt,
        );

        return tx.mealItem.create({
          data: {
            mealId: meal.id,
            userId: params.userId,
            foodId: params.foodId,
            consumedWeightG: params.consumedWeightG,
            mealType: params.mealType,
            energyKcal: params.calculatedNutrition.energy_kcal,
            proteinG: params.calculatedNutrition.protein_g,
            carbohydratesG: params.calculatedNutrition.carbohydrates_g,
            fatG: params.calculatedNutrition.fat_g,
            fiberG: params.calculatedNutrition.fiber_g,
            idempotencyKey: params.idempotencyKey,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION &&
        params.idempotencyKey
      ) {
        throw new IdempotencyKeyConflictError(params.idempotencyKey);
      }
      throw error;
    }
  },

  /** Yalnızca istenen kullanıcıya ait kayıt döner; aksi halde `null`. */
  async findMealItemForUser(
    userId: string,
    mealItemId: string,
  ): Promise<MealItem | null> {
    const item = await prisma.mealItem.findUnique({ where: { id: mealItemId } });
    if (!item || item.userId !== userId) {
      return null;
    }
    return item;
  },

  async listMealItemsForUser(
    userId: string,
    range?: { from: Date; to: Date },
  ): Promise<MealItem[]> {
    return prisma.mealItem.findMany({
      where: {
        userId,
        status: "ACTIVE",
        // Aralık filtresi, kaydın oluşturulma anı yerine öğünün "yendiği gün"
        // bilgisini taşıyan Meal.consumedAt üzerinden uygulanır.
        ...(range ? { meal: { consumedAt: { gte: range.from, lt: range.to } } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  },
};
