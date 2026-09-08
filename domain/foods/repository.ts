import type {
  Food,
  FoodImportRun,
  FoodNutritionFacts,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { FoodNutritionFactsPer100g } from "@/domain/nutrition/calculation";

export interface NutritionFactsProvenance {
  source: string;
  sourceRef?: string;
}

/** Varsayılan client veya bir `$transaction` callback'i içindeki `tx`. */
type Db = typeof prisma | Prisma.TransactionClient;

export interface CreateImportRunParams {
  source: string;
  requestedCount: number;
  importedCount: number;
  duplicateCount: number;
  mappingErrorCount: number;
  skippedCount: number;
  details: unknown;
}

export const foodsRepository = {
  async createFood(name: string, db: Db = prisma): Promise<Food> {
    return db.food.create({ data: { name } });
  },

  async findById(foodId: string, db: Db = prisma): Promise<Food | null> {
    return db.food.findUnique({ where: { id: foodId } });
  },

  /**
   * Bir Food için doğrulanmış 100g başına değerleri yazar. `upsert`
   * kullanılır: aynı food_id için tekrar çağrılırsa (ör. veri düzeltmesi)
   * mevcut kayıt güncellenir — ama bu, o ana kadar oluşturulmuş MealItem
   * snapshot'larını ASLA etkilemez (onlar zaten kendi kopyalarını taşır).
   */
  async upsertNutritionFacts(
    foodId: string,
    facts: FoodNutritionFactsPer100g,
    provenance: NutritionFactsProvenance,
    db: Db = prisma,
  ): Promise<FoodNutritionFacts> {
    const data = {
      energyKcalPer100g: facts.energy_kcal_per_100g,
      proteinGPer100g: facts.protein_g_per_100g,
      carbohydratesGPer100g: facts.carbohydrates_g_per_100g,
      fatGPer100g: facts.fat_g_per_100g,
      fiberGPer100g: facts.fiber_g_per_100g,
      source: provenance.source,
      sourceRef: provenance.sourceRef,
    };

    return db.foodNutritionFacts.upsert({
      where: { foodId },
      create: { foodId, ...data },
      update: { ...data, verifiedAt: new Date() },
    });
  },

  /**
   * `(source, sourceRef)` ile eşleşen facts kaydını arar — bir dış kaynak
   * kaydının DAHA ÖNCE import edilip edilmediğini belirlemenin TEK yolu
   * (idempotent import için gerekli). Farklı bir `source` altındaki
   * (ör. "MANUAL_VERIFIED") kayıtlara asla bu yoldan erişilmez/dokunulmaz —
   * bu, manuel doğrulanmış verilerin import tarafından ezilmeyeceğinin
   * yapısal garantisidir.
   */
  async findFactsBySourceRef(
    source: string,
    sourceRef: string,
    db: Db = prisma,
  ): Promise<FoodNutritionFacts | null> {
    return db.foodNutritionFacts.findUnique({
      where: { source_sourceRef: { source, sourceRef } },
    });
  },

  async createImportRun(
    params: CreateImportRunParams,
    db: Db = prisma,
  ): Promise<FoodImportRun> {
    return db.foodImportRun.create({
      data: {
        source: params.source,
        requestedCount: params.requestedCount,
        importedCount: params.importedCount,
        duplicateCount: params.duplicateCount,
        mappingErrorCount: params.mappingErrorCount,
        skippedCount: params.skippedCount,
        details: params.details as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  },

  /** Bir batch'i tek bir transaction içinde çalıştırmak için. */
  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(fn);
  },

  /**
   * Verilen kelimelerden EN AZ BİRİNİ adında geçiren, VE gerçekten
   * doğrulanmış besin değeri OLAN food'ları döner (bkz.
   * domain/foods/foodMatcher.ts). Facts'i olmayan bir Food, ADIM 16
   * çağrıldığında zaten hata verir — bu yüzden aday olarak hiç sunulmaz.
   */
  async searchByNameWords(
    words: string[],
    limit = 20,
    db: Db = prisma,
  ): Promise<Food[]> {
    if (words.length === 0) return [];
    return db.food.findMany({
      where: {
        AND: [
          { nutritionFacts: { isNot: null } },
          {
            OR: words.map((word) => ({
              name: { contains: word, mode: "insensitive" as const },
            })),
          },
        ],
      },
      take: limit,
    });
  },
};
