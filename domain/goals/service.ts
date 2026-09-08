import type { DailyNutritionGoal } from "@prisma/client";
import { goalsRepository } from "./repository";
import { resolveAssignedTrainerId } from "@/domain/authz/service";
import type { DailyNutritionGoals } from "@/types/goals";

/**
 * Hedefleri kimin belirlediğini açıkça taşıyan aktör tipi. AI/coach
 * modüllerinin bu tipten bir değer üretip `setGoalsForUser`'ı çağırması
 * mimari olarak YASAKTIR — coach modülleri yalnızca
 * `getCurrentGoalsForUser`'ı import etmelidir (bkz. domain/coach/README.md).
 *
 * `trainerUserId`: trainer'ın kendi (Supabase auth) kullanıcı kimliği —
 * `Trainer.id` (profil id'si) DEĞİL. Atama kontrolü ve Trainer.id çözümü
 * burada, `domain/authz/service.ts` → `resolveAssignedTrainerId` üzerinden
 * TEK bir yerden yapılır (bkz. ADIM 24, domain/authz/README.md).
 */
export type GoalWriteActor =
  | { type: "SYSTEM" }
  | { type: "TRAINER"; trainerUserId: string };

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
  let setByTrainerId: string | null = null;

  if (actor.type === "TRAINER") {
    const trainerId = await resolveAssignedTrainerId(
      actor.trainerUserId,
      userId,
    );
    if (!trainerId) {
      throw new UnauthorizedGoalWriteError(
        `Trainer ${actor.trainerUserId}, kullanıcı ${userId} için hedef belirleme yetkisine sahip değil.`,
      );
    }
    setByTrainerId = trainerId;
  }

  return goalsRepository.createForUser({
    ...goals,
    userId,
    setBy: actor.type,
    setByTrainerId,
  });
}
