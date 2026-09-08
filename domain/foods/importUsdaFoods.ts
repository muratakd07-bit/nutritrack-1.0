import { foodsRepository } from "./repository";
import { mapUsdaFoodToVerifiedFood } from "./usdaMapper";
import type { UsdaFood } from "./usdaTypes";

export const USDA_SOURCE = "USDA_FDC";

/** Bir batch içinde DB'ye yazılan food sayısı — büyük dataset'lerde tek
 * transaction yerine bu boyutta parçalara bölünür. */
const BATCH_SIZE = 20;

export type ImportOutcome =
  | "imported"
  | "duplicate"
  | "mapping_error"
  | "skipped";

export interface ImportDetail {
  fdcId: number;
  description?: string;
  outcome: ImportOutcome;
  reason?: string;
}

export interface ImportSummary {
  runId: string;
  source: string;
  requestedCount: number;
  importedCount: number;
  duplicateCount: number;
  mappingErrorCount: number;
  skippedCount: number;
  details: ImportDetail[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/**
 * `requestedFdcIds`'in gerçekte import edilmesi: mapping → idempotency
 * kontrolü → yazma.
 *
 * KASITLI OLARAK ağa erişmez — `fetchedFoods`, çağıran tarafından
 * (bkz. domain/foods/usdaClient.ts, scripts/import-usda-foods.mjs) önceden
 * çekilmiş ham USDA verisidir. Bu ayrım iki nedenle önemlidir:
 *  1. Test edilebilirlik: bu fonksiyon ağ olmadan, gerçek/sentetik
 *     fixture'larla tam olarak test edilebilir.
 *  2. Rate-limit güvenliği: USDA'ya kaç istek yapılacağına yalnızca
 *     fetch katmanı karar verir, import mantığı bundan bağımsızdır.
 *
 * IDEMPOTENCY: Her food, `(source, sourceRef)` = `("USDA_FDC", fdcId)`
 * ile kontrol edilir. Daha önce import edilmişse "duplicate" olarak
 * işaretlenir, YENİDEN YAZILMAZ. Farklı bir `source`'a (ör. admin'in
 * manuel girdiği bir kayıt) bu fonksiyon hiçbir zaman dokunmaz — çünkü
 * arama anahtarı her zaman "USDA_FDC" ile sabittir.
 *
 * BATCH: Yazmalar `BATCH_SIZE`'lık gruplar halinde, her grup kendi
 * transaction'ında yapılır — tüm import tek bir dev transaction'a
 * bağlanmaz.
 *
 * AUDIT: Çalışma sonunda bir `FoodImportRun` kaydı oluşturulur
 * (bkz. domain/foods/repository.ts).
 */
export async function importUsdaFoods(
  requestedFdcIds: number[],
  fetchedFoods: UsdaFood[],
): Promise<ImportSummary> {
  const details: ImportDetail[] = [];
  const fetchedById = new Map(fetchedFoods.map((f) => [f.fdcId, f]));

  for (const fdcId of requestedFdcIds) {
    if (!fetchedById.has(fdcId)) {
      details.push({
        fdcId,
        outcome: "skipped",
        reason: "USDA API yanıtında bulunamadı",
      });
    }
  }

  const toProcess = requestedFdcIds
    .map((id) => fetchedById.get(id))
    .filter((f): f is UsdaFood => f !== undefined);

  for (const batch of chunk(toProcess, BATCH_SIZE)) {
    await foodsRepository.runInTransaction(async (tx) => {
      for (const food of batch) {
        const mapped = mapUsdaFoodToVerifiedFood(food);
        if (!mapped.ok) {
          details.push({
            fdcId: food.fdcId,
            description: food.description,
            outcome: "mapping_error",
            reason: mapped.problem.reason,
          });
          continue;
        }

        const existing = await foodsRepository.findFactsBySourceRef(
          USDA_SOURCE,
          mapped.food.sourceRef,
          tx,
        );
        if (existing) {
          details.push({
            fdcId: food.fdcId,
            description: food.description,
            outcome: "duplicate",
            reason: `zaten import edilmiş (foodId=${existing.foodId})`,
          });
          continue;
        }

        const newFood = await foodsRepository.createFood(mapped.food.name, tx);
        await foodsRepository.upsertNutritionFacts(
          newFood.id,
          mapped.food.facts,
          { source: USDA_SOURCE, sourceRef: mapped.food.sourceRef },
          tx,
        );
        details.push({
          fdcId: food.fdcId,
          description: food.description,
          outcome: "imported",
        });
      }
    });
  }

  const importedCount = details.filter((d) => d.outcome === "imported").length;
  const duplicateCount = details.filter((d) => d.outcome === "duplicate").length;
  const mappingErrorCount = details.filter(
    (d) => d.outcome === "mapping_error",
  ).length;
  const skippedCount = details.filter((d) => d.outcome === "skipped").length;

  const run = await foodsRepository.createImportRun({
    source: USDA_SOURCE,
    requestedCount: requestedFdcIds.length,
    importedCount,
    duplicateCount,
    mappingErrorCount,
    skippedCount,
    details,
  });

  return {
    runId: run.id,
    source: USDA_SOURCE,
    requestedCount: requestedFdcIds.length,
    importedCount,
    duplicateCount,
    mappingErrorCount,
    skippedCount,
    details,
  };
}
