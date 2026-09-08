import { getCurrentGoalsForUser } from "@/domain/goals/service";
import { getDailySummaryForUser } from "@/domain/reports/dailySummary";
import type { CoachReadOnlyContext } from "./types";

/**
 * Coach/AI modüllerinin kullanıcı bağlamına erişmesi gereken TEK giriş
 * noktası. Kasıtlı olarak yalnızca salt-okunur fonksiyonları
 * (`getCurrentGoalsForUser`, `getDailySummaryForUser`) çağırır.
 *
 * `domain/goals/service.ts` içindeki `setGoalsForUser` veya
 * `domain/nutrition/contract.ts` BURADAN ASLA import edilmemelidir — coach
 * modülleri hedef belirleyemez ve nutrition hesaplayamaz, yalnızca okur.
 */
export async function getCoachContext(
  userId: string,
  date: Date = new Date(),
): Promise<CoachReadOnlyContext> {
  const [goals, todaySummary] = await Promise.all([
    getCurrentGoalsForUser(userId),
    getDailySummaryForUser(userId, date),
  ]);

  return { goals, todaySummary };
}
