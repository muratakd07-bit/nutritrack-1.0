import { prisma } from "@/lib/db/prisma";
import { startOfDayUTC, endOfDayUTC } from "@/lib/utils/date";
import type { CalculatedNutrition } from "@/types/nutrition";

export interface DailySummary extends CalculatedNutrition {
  item_count: number;
}

/**
 * Bir kullanıcının belirli bir gündeki toplam nutrition değerlerini döner.
 *
 * KURAL: Bu fonksiyon YENİ bir nutrition sonucu HESAPLAMAZ. Yalnızca ADIM 16
 * tarafından üretilip her MealItem üzerinde snapshot'lanmış değerleri TOPLAR
 * (SUM). Zaten hesaplanmış değerleri toplamak, source-of-truth kuralını ihlal
 * etmez; yeni bir nutrition sonucu üretmek farklı bir şeydir ve burada
 * yapılmaz.
 *
 * Not: Bu değer şu an için KALICI BİR TABLODA SAKLANMAZ, her istekte
 * MealItem üzerinden canlı olarak hesaplanır. Gerekçe: veri her zaman
 * MealItem'lardan türetilebilir olduğu için ayrı bir "daily_summaries"
 * tablosunu senkronize tutmanın (her ekleme/silme/güncellemede yeniden
 * hesaplama) getirdiği karmaşıklık, bu aşamada faydasından fazladır.
 * İleride performans gerektirirse, bu fonksiyonun imzası değişmeden bir
 * materialized view veya cache katmanına taşınabilir.
 */
export async function getDailySummaryForUser(
  userId: string,
  date: Date,
): Promise<DailySummary> {
  const result = await prisma.mealItem.aggregate({
    where: {
      userId,
      status: "ACTIVE",
      meal: {
        consumedAt: { gte: startOfDayUTC(date), lt: endOfDayUTC(date) },
      },
    },
    _sum: {
      energyKcal: true,
      proteinG: true,
      carbohydratesG: true,
      fatG: true,
      fiberG: true,
    },
    _count: true,
  });

  return {
    energy_kcal: result._sum.energyKcal ?? 0,
    protein_g: result._sum.proteinG ?? 0,
    carbohydrates_g: result._sum.carbohydratesG ?? 0,
    fat_g: result._sum.fatG ?? 0,
    fiber_g: result._sum.fiberG ?? 0,
    item_count: result._count,
  };
}
