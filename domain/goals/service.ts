import type { DailyNutritionGoal } from "@prisma/client";
import { goalsRepository } from "./repository";
import type { DailyNutritionGoals } from "@/types/goals";

/**
 * Hedefleri kimin belirlediğini açıkça taşıyan aktör tipi. AI/coach
 * modüllerinin bu tipten bir değer üretip `setGoalsForUser`'ı çağırması
 * mimari olarak YASAKTIR — coach modülleri yalnızca
 * `getCurrentGoalsForUser`'ı import etmelidir (bkz. domain/coach/README.md).
 */
export type GoalWriteActor =
  | { type: "SYSTEM" }
  | { type: "TRAINER"; trainerId: string };

export class UnauthorizedGoalWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedGoalWriteError";
  }
}

/** Salt okunur erişim — coach/AI dahil her modül bunu kullanabilir. */
export async function getCurrentGoalsForUser(
  userId: string,
): Promise<DailyNutritionGoal | null> {
  return goalsRepository.getLatestForUser(userId);
}

/**
 * Hedefleri yazar. Yalnızca SYSTEM (uygulama varsayılanı) veya kullanıcıya
 * gerçekten atanmış bir TRAINER tarafından çağrılabilir. Başka bir kullanıcı
 * için yetkisiz bir trainer bu fonksiyonu çağırırsa reddedilir.
 */
export async function setGoalsForUser(
  userId: string,
  goals: DailyNutritionGoals,
  actor: GoalWriteActor,
): Promise<DailyNutritionGoal> {
  if (actor.type === "TRAINER") {
    const isAssigned = await goalsRepository.isTrainerAssignedToUser(
      actor.trainerId,
      userId,
    );
    if (!isAssigned) {
      throw new UnauthorizedGoalWriteError(
        `Trainer ${actor.trainerId}, kullanıcı ${userId} için hedef belirleme yetkisine sahip değil.`,
      );
    }
  }

  return goalsRepository.createForUser({
    ...goals,
    userId,
    setBy: actor.type,
    setByTrainerId: actor.type === "TRAINER" ? actor.trainerId : null,
  });
}
