/**
 * USDA FoodData Central'dan gerçek, doğrulanmış besin verisi import eder.
 *
 * Kullanım:
 *   npm run import:usda -- <fdcId1> <fdcId2> ...
 *
 * (`npm run import:usda` scripti .env.local'i `node --env-file` ile yükler —
 * ES module import sırası nedeniyle bu dosya İÇİNDE yapılan bir env-file
 * yüklemesi güvenilir OLMAZ: import edilen modüller [ör. lib/db/prisma.ts]
 * her zaman bu dosyanın kendi kodu çalışmadan ÖNCE değerlendirilir.)
 *
 * USDA_FDC_API_KEY ortam değişkeni tanımlı değilse DEMO_KEY kullanılır
 * (çok düşük, PAYLAŞILAN bir rate limite sahiptir — gerçek/ölçekli import
 * için kendi ücretsiz anahtarınızı https://api.data.gov/signup/ adresinden
 * alıp USDA_FDC_API_KEY olarak .env.local'e ekleyin).
 *
 * Bu script API key'i veya başka bir secret'ı ASLA loglamaz.
 */
import { getUsdaFoodsByIds } from "@/domain/foods/usdaClient";
import { importUsdaFoods } from "@/domain/foods/importUsdaFoods";

async function main() {
  const fdcIds = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);

  if (fdcIds.length === 0) {
    console.error(
      "Kullanım: import-usda-foods.ts <fdcId1> <fdcId2> ... (en az bir geçerli USDA FDC ID gerekli)",
    );
    process.exit(1);
  }

  console.log(`USDA FDC'den ${fdcIds.length} besin isteniyor: [${fdcIds.join(", ")}]`);
  console.log(
    process.env.USDA_FDC_API_KEY
      ? "Kendi USDA_FDC_API_KEY'iniz kullanılıyor."
      : "UYARI: USDA_FDC_API_KEY tanımlı değil, DEMO_KEY kullanılıyor (çok düşük/paylaşılan rate limit).",
  );

  const fetchedFoods = await getUsdaFoodsByIds(fdcIds);
  console.log(`USDA API'den ${fetchedFoods.length} kayıt döndü.`);

  const summary = await importUsdaFoods(fdcIds, fetchedFoods);

  console.log("\n=== Import Özeti ===");
  console.log(`Kaynak: ${summary.source}`);
  console.log(`İstenen: ${summary.requestedCount}`);
  console.log(`Import edildi: ${summary.importedCount}`);
  console.log(`Duplicate (zaten vardı): ${summary.duplicateCount}`);
  console.log(`Mapping problemi: ${summary.mappingErrorCount}`);
  console.log(`Atlandı: ${summary.skippedCount}`);
  console.log(`Audit run id: ${summary.runId}`);
  console.log("\nDetaylar:");
  for (const d of summary.details) {
    console.log(`  [${d.outcome}] fdcId=${d.fdcId} ${d.description ?? ""} ${d.reason ? `— ${d.reason}` : ""}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Import başarısız:", err.message);
    process.exit(1);
  });
