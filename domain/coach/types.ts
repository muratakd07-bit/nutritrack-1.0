import type { DailyNutritionGoal } from "@prisma/client";
import type { DailySummary } from "@/domain/reports/dailySummary";

/**
 * AI/coach modüllerine verilen SALT OKUNUR bağlam.
 *
 * Bu tip kasıtlı olarak yalnızca zaten hesaplanmış/kaydedilmiş verileri
 * (hedefler + günlük toplam) içerir. Coach modülleri bu verilerden yeni bir
 * nutrition sonucu türetip kullanıcıya "gerçek" değermiş gibi sunamaz;
 * yalnızca yorum/öneri üretebilir.
 */
export interface CoachReadOnlyContext {
  goals: DailyNutritionGoal | null;
  todaySummary: DailySummary;
}
