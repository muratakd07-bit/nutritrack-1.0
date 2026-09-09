/**
 * USDA FoodData Central'dan gerçek, doğrulanmış besin verisi import eder.
 *
 * İKİ kullanım şekli:
 *
 *   1) KEŞİF (discovery) modu — Foundation/SR Legacy veri setini
 *      sayfalayarak (`/foods/list`) gerçek fdcId'ler bulur ve import eder:
 *        npm run import:usda -- --limit 100 [--page-size 50]
 *
 *   2) AÇIK fdcId modu (ADIM 26'dan, geriye dönük uyumlu) — belirli,
 *      bilinen fdcId'leri import eder:
 *        npm run import:usda -- 331960 173410
 *
 * (`npm run import:usda` scripti .env.local'i `node --env-file` ile yükler —
 * ES module import sırası nedeniyle bu dosya İÇİNDE yapılan bir env-file
 * yüklemesi güvenilir OLMAZ: import edilen modüller [ör. lib/db/prisma.ts]
 * her zaman bu dosyanın kendi kodu çalışmadan ÖNCE değerlendirilir.)
 *
 * USDA_FDC_API_KEY ortam değişkeni tanımlı değilse DEMO_KEY kullanılır
 * (çok düşük, PAYLAŞILAN bir rate limite sahiptir — bkz. domain/foods/README.md).
 * Bu script BÜYÜK bir import'u (`--limit` yüksek bir değerse) DEMO_KEY ile
 * KENDİLİĞİNDEN başlatmaz — yalnızca eksik olduğunu raporlar ve küçük
 * (`--limit` ≤ SAFE_DEMO_KEY_LIMIT) denemelere izin verir.
 *
 * DAYANIKLILIK: fdcId'ler `FETCH_BATCH_SIZE`'lık gruplar halinde işlenir.
 * Bir grup (429/5xx/ağ hatası kontrollü retry'lardan SONRA da) başarısız
 * olursa, o ana kadar BAŞARILI olan gruplar KORUNUR (idempotent import +
 * her grup kendi transaction'ı), script "PARTIAL" olarak raporlar ve
 * çıkar — aynı komutu TEKRAR çalıştırmak, `/foods/list`'in deterministik
 * sıralaması (`sortBy=fdcId, sortOrder=asc`) sayesinde kaldığı yerden
 * devam eder (zaten import edilenler "duplicate" olarak hızlıca atlanır).
 *
 * Bu script API key'i veya başka bir secret'ı ASLA loglamaz.
 */
import { pathToFileURL } from "node:url";
import { getUsdaFoodsByIds, hasRealUsdaApiKey, listUsdaFoods, UsdaApiError } from "@/domain/foods/usdaClient";
import { importUsdaFoods, type ImportSummary } from "@/domain/foods/importUsdaFoods";

const SUPPORTED_DATA_TYPES = ["Foundation", "SR Legacy"];
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
/** DEMO_KEY ile (kendi USDA_FDC_API_KEY'iniz olmadan) izin verilen en büyük `--limit`. */
const SAFE_DEMO_KEY_LIMIT = 25;
/** Bir seferde `getUsdaFoodsByIds`'e verilecek fdcId sayısı — büyük tek bir
 * istek yerine, kısmi başarısızlıkta önceki gruplar kalıcı kalsın diye. */
const FETCH_BATCH_SIZE = 20;
/** `/foods/list` sayfalamasında sonsuz döngüye karşı güvenlik sınırı. */
const MAX_PAGES = 500;

interface DiscoveryArgs {
  mode: "discovery";
  limit: number;
  pageSize: number;
}

interface ExplicitArgs {
  mode: "explicit";
  fdcIds: number[];
}

export function parseArgs(argv: string[]): DiscoveryArgs | ExplicitArgs | null {
  const hasFlag = argv.some((a) => a.startsWith("--"));
  if (!hasFlag) {
    const fdcIds = argv.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return fdcIds.length > 0 ? { mode: "explicit", fdcIds } : null;
  }

  let limit: number | null = null;
  let pageSize = DEFAULT_PAGE_SIZE;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") {
      limit = Number(argv[i + 1]);
      i++;
    } else if (argv[i] === "--page-size") {
      pageSize = Number(argv[i + 1]);
      i++;
    }
  }
  if (!limit || !Number.isInteger(limit) || limit <= 0) return null;
  if (!Number.isInteger(pageSize) || pageSize <= 0) pageSize = DEFAULT_PAGE_SIZE;
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  return { mode: "discovery", limit, pageSize };
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/**
 * `/foods/list`'i sayfa sayfa çağırarak, en fazla `limit` kadar GERÇEK
 * fdcId keşfeder. Sıralama (`sortBy=fdcId`) deterministiktir — aynı
 * `--limit` ile TEKRAR çalıştırmak aynı ilk N kaydı verir (resume'u
 * mümkün kılan şey budur).
 */
export async function discoverFdcIds(limit: number, pageSize: number): Promise<number[]> {
  const fdcIds: number[] = [];
  for (let page = 1; page <= MAX_PAGES && fdcIds.length < limit; page++) {
    const items = await listUsdaFoods(SUPPORTED_DATA_TYPES, pageSize, page);
    if (items.length === 0) break; // veri seti tükendi
    for (const item of items) {
      fdcIds.push(item.fdcId);
      if (fdcIds.length >= limit) break;
    }
    if (items.length < pageSize) break; // son sayfa
  }
  return fdcIds.slice(0, limit);
}

function printSummary(summary: ImportSummary) {
  console.log(`  Kaynak: ${summary.source} | Run id: ${summary.runId}`);
  console.log(
    `  İstenen: ${summary.requestedCount} | İmport: ${summary.importedCount} | ` +
      `Duplicate: ${summary.duplicateCount} | Mapping hatası: ${summary.mappingErrorCount} | Atlandı: ${summary.skippedCount}`,
  );
  for (const d of summary.details) {
    console.log(
      `    [${d.outcome}] fdcId=${d.fdcId}${d.dataType ? ` (${d.dataType})` : ""} ${
        d.description ?? ""
      }${d.reason ? ` — ${d.reason}` : ""}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(
      "Kullanım:\n" +
        "  npm run import:usda -- --limit 100 [--page-size 50]   (keşif modu)\n" +
        "  npm run import:usda -- <fdcId1> <fdcId2> ...          (açık fdcId modu)",
    );
    process.exit(1);
  }

  const hasKey = hasRealUsdaApiKey();
  console.log(
    hasKey
      ? "Kendi USDA_FDC_API_KEY'iniz kullanılıyor."
      : "UYARI: USDA_FDC_API_KEY tanımlı değil, DEMO_KEY kullanılıyor (çok düşük/paylaşılan rate limit).",
  );

  let fdcIds: number[];
  if (args.mode === "explicit") {
    fdcIds = args.fdcIds;
    console.log(`Açık fdcId listesi: ${fdcIds.length} kayıt istendi.`);
  } else {
    if (!hasKey && args.limit > SAFE_DEMO_KEY_LIMIT) {
      console.error(
        `USDA_FDC_API_KEY mevcut değil — DEMO_KEY ile büyük bir import (--limit ${args.limit}) ` +
          `KENDİLİĞİNDEN BAŞLATILMAYACAK (güvenli üst sınır: ${SAFE_DEMO_KEY_LIMIT}).\n` +
          "Gerçek bir anahtar edinmek için: https://api.data.gov/signup/\n" +
          `Küçük bir deneme için: npm run import:usda -- --limit ${SAFE_DEMO_KEY_LIMIT}`,
      );
      process.exit(1);
    }
    console.log(`Keşif modu: dataType=[${SUPPORTED_DATA_TYPES.join(", ")}], limit=${args.limit}, pageSize=${args.pageSize}`);
    fdcIds = await discoverFdcIds(args.limit, args.pageSize);
    console.log(`Keşfedilen fdcId sayısı: ${fdcIds.length}`);
  }

  if (fdcIds.length === 0) {
    console.log("İşlenecek fdcId yok, çıkılıyor.");
    return;
  }

  const batches = chunk(fdcIds, FETCH_BATCH_SIZE);
  const summaries: ImportSummary[] = [];
  let failedAtBatch: number | null = null;
  let failureMessage = "";

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n=== Grup ${i + 1}/${batches.length} (${batch.length} fdcId) ===`);
    try {
      const fetched = await getUsdaFoodsByIds(batch);
      const summary = await importUsdaFoods(batch, fetched);
      summaries.push(summary);
      printSummary(summary);
    } catch (error) {
      failedAtBatch = i + 1;
      failureMessage = error instanceof Error ? error.message : String(error);
      console.error(`  BAŞARISIZ: ${failureMessage}`);
      break; // kalan gruplara devam etmenin anlamı yok (muhtemelen kalıcı rate-limit/ağ sorunu)
    }
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      requested: acc.requested + s.requestedCount,
      imported: acc.imported + s.importedCount,
      duplicate: acc.duplicate + s.duplicateCount,
      mappingError: acc.mappingError + s.mappingErrorCount,
      skipped: acc.skipped + s.skippedCount,
    }),
    { requested: 0, imported: 0, duplicate: 0, mappingError: 0, skipped: 0 },
  );

  console.log("\n=== TOPLAM ÖZET ===");
  console.log(`Gruplar: ${summaries.length}/${batches.length} tamamlandı`);
  console.log(
    `İstenen: ${totals.requested} | İmport: ${totals.imported} | Duplicate: ${totals.duplicate} | ` +
      `Mapping hatası: ${totals.mappingError} | Atlandı: ${totals.skipped}`,
  );
  console.log(`Run id'leri: ${summaries.map((s) => s.runId).join(", ") || "(yok)"}`);

  if (failedAtBatch !== null) {
    console.error(
      `\nDURUM: PARTIAL — grup ${failedAtBatch}/${batches.length}'de durdu: ${failureMessage}\n` +
        "Önceki gruplar KALICI (transaction bazında commit edildi). Aynı komutu TEKRAR " +
        "çalıştırmak, zaten import edilenleri hızlıca atlayıp kaldığı yerden devam eder.",
    );
    process.exit(1);
  }

  console.log("\nDURUM: TAMAMLANDI");
}

// Yalnızca bu dosya DOĞRUDAN çalıştırıldığında main()'i tetikler — bir
// test dosyası tarafından import edildiğinde (bkz.
// scripts/import-usda-foods.test.ts) çalışmaz/process.exit çağırmaz.
const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      if (err instanceof UsdaApiError) {
        console.error(`Import başarısız (USDA API): ${err.message}`);
      } else {
        console.error("Import başarısız:", err.message);
      }
      process.exit(1);
    });
}
