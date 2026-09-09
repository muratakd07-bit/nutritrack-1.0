/**
 * ADIM 27 — GERÇEK canlı doğrulama: gerçek Qwen3-VL API çağrısı → zod şema
 * doğrulaması → gerçek FoodMatcher (gerçek DB) → SİMÜLE EDİLMİŞ kullanıcı
 * onayı → gerçek ADIM 16 hesaplaması → gerçek MealItem → gerçek günlük
 * toplam.
 *
 * Normal `npm test` akışının PARÇASI DEĞİLDİR. Hem gerçek bir Supabase
 * bağlantısı (RUN_DB_INTEGRATION_TESTS=1) HEM DE gerçek Qwen3-VL kimlik
 * bilgileri (.env.local'de QWEN3_VL_BASE_URL + QWEN3_VL_API_KEY) gerektirir
 * — ikisinden biri eksikse test OTOMATİK ATLANIR, ASLA mock'a sessizce
 * düşmez (foodRecognitionSource seçimi domain/nutrition/foodRecognition.ts'te
 * zaten bu kurala göre yapılıyor). Çalıştırmak için:
 *
 *   RUN_DB_INTEGRATION_TESTS=1 node --env-file=.env.local \
 *     node_modules/vitest/vitest.mjs run domain/nutrition/qwen3vlLiveChain.integration.test.ts
 *
 * GERÇEK bir dış API'ye GERÇEK (ücretli olabilecek) bir ağ çağrısı yapar —
 * bu yüzden CI'da veya normal test suitinde VARSAYILAN OLARAK ÇALIŞMAZ.
 *
 * ÖNEMLİ DÜRÜSTLÜK NOTU: Test görseli GERÇEK bir yemek fotoğrafı DEĞİLDİR
 * — programatik olarak üretilmiş basit, turuncu/yuvarlak bir sentetik PNG'dir
 * (bkz. buildSyntheticTestImage). Amaç bir "yemek tanıma doğruluğu" iddiası
 * değil, GERÇEK API'nin uçtan uca protokol/parsing/entegrasyon davranışını
 * (HTTP, auth header, request/response şekli, zod doğrulaması, FoodMatcher,
 * ADIM 16 zinciri) doğrulamaktır. Model bu görseli tanıyamayabilir/boş
 * candidate_labels dönebilir — bu da GEÇERLİ, raporlanan bir sonuçtur;
 * zincir o durumda FoodMatcher aşamasından önce durur ve test bunu da
 * doğrular (sessizce atlamaz).
 */
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roundToOneDecimal } from "./calculation";

const RUN_DB = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const HAS_QWEN_CREDS = Boolean(
  process.env.QWEN3_VL_BASE_URL && process.env.QWEN3_VL_API_KEY,
);

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Sentetik, turuncu/yuvarlak bir PNG üretir (ör. bir portakal/top şekli).
 * GERÇEK bir yemek fotoğrafı değildir — bkz. dosya başındaki dürüstlük notu.
 * Harici bir dosya indirilmez/kullanılmaz; görsel tamamen bu fonksiyon
 * içinde, yalnızca Node'un yerleşik zlib'iyle üretilir.
 */
function buildSyntheticTestImage(): { base64: string; mimeType: string } {
  const size = 64;
  const stride = 1 + size * 3;
  const raw = Buffer.alloc(size * stride);
  const center = size / 2;
  const radius = size * 0.35;

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const inside = dx * dx + dy * dy <= radius * radius;
      const off = rowStart + 1 + x * 3;
      raw[off] = inside ? 240 : 255;
      raw[off + 1] = inside ? 130 : 255;
      raw[off + 2] = inside ? 30 : 255;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const idatData = deflateSync(raw);

  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdrData),
    pngChunk("IDAT", idatData),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);

  return { base64: png.toString("base64"), mimeType: "image/png" };
}

describe.skipIf(!RUN_DB || !HAS_QWEN_CREDS)(
  "ADIM 27 — GERÇEK Qwen3-VL canlı çağrısı → FoodMatcher → ADIM 16 → MealItem (gerçek API + gerçek DB)",
  () => {
    let prisma: typeof import("@/lib/db/prisma").prisma;
    let analyzeFoodPhoto: typeof import("./photoAnalysis").analyzeFoodPhoto;
    let createMealItemForUser: typeof import("@/domain/meal/service").createMealItemForUser;
    let getDailySummaryForUser: typeof import("@/domain/reports/dailySummary").getDailySummaryForUser;

    const testRunId = randomUUID();
    const userId = randomUUID();
    const cleanupUserIds: string[] = [userId];
    let liveAnalysis: Awaited<ReturnType<typeof analyzeFoodPhoto>>;

    beforeAll(async () => {
      ({ prisma } = await import("@/lib/db/prisma"));
      ({ analyzeFoodPhoto } = await import("./photoAnalysis"));
      ({ createMealItemForUser } = await import("@/domain/meal/service"));
      ({ getDailySummaryForUser } = await import(
        "@/domain/reports/dailySummary"
      ));

      await prisma.user.create({
        data: { id: userId, email: `adim27-live-${testRunId}@test.invalid` },
      });
    });

    afterAll(async () => {
      // Yalnızca BU testin oluşturduğu kullanıcı/meal verisi silinir (cascade).
      // FoodMatcher'ın olası bir USDA fallback importu tetiklediği herhangi
      // bir Food/FoodNutritionFacts kaydı SİLİNMEZ — bu, ADIM 26'nın
      // tasarımı gereği gerçek, doğrulanmış, kalıcı veridir (test verisi
      // değildir), tıpkı gerçek bir kullanıcının tetikleyeceği import gibi.
      for (const uid of cleanupUserIds) {
        await prisma.user.deleteMany({ where: { id: uid } });
      }
    });

    it("gerçek Qwen3-VL çağrısı yapılır, HTTP başarılı döner, yanıt zod şemasından geçer, nutrition alanı ÜRETMEZ", async () => {
      const image = buildSyntheticTestImage();
      const startedAt = Date.now();

      // Not: recognitionSource kasıtlı olarak override EDİLMİYOR — burada
      // domain/nutrition/foodRecognition.ts'in gerçek varsayılan seçimi
      // (env değişkenleri mevcut olduğu için Qwen3VLFoodRecognitionSource)
      // kullanılıyor. Herhangi bir hata (ağ, 4xx/5xx, malformed response,
      // zod validation) burada YAKALANMADAN fırlatılır — test bunu
      // olduğu gibi raporlar, mock'a düşmez.
      liveAnalysis = await analyzeFoodPhoto({
        image_base64: image.base64,
        mime_type: image.mimeType,
      });

      const latencyMs = Date.now() - startedAt;
      expect(latencyMs).toBeGreaterThan(0);

      // AI çıktısında nutrition alanı OLAMAZ (tip seviyesinde zaten yok —
      // FoodRecognitionRawResult/PhotoAnalysisResult'ta energy/protein/
      // fat/carbohydrates/fiber alanı tanımlı değildir; burada ayrıca
      // çalışma zamanında da doğruluyoruz).
      for (const forbiddenKey of [
        "energy_kcal",
        "protein_g",
        "fat_g",
        "carbohydrates_g",
        "fiber_g",
      ]) {
        expect(liveAnalysis).not.toHaveProperty(forbiddenKey);
      }

      expect(typeof liveAnalysis.estimated_weight_g).toBe("number");
      expect(typeof liveAnalysis.visual_description).toBe("string");
      expect(Array.isArray(liveAnalysis.candidates)).toBe(true);
    });

    it("FoodMatcher gerçek DB'ye karşı çalışır; eşleşme varsa gerçek ADIM 16 → MealItem → günlük toplam zinciri tamamlanır", async () => {
      expect(liveAnalysis).toBeDefined();

      if (liveAnalysis.is_unrecognized || liveAnalysis.candidates.length === 0) {
        // Sentetik test görseli gerçek bir yemek olmadığı için model hiçbir
        // eşleşebilir aday üretmemiş olabilir — bu GEÇERLİ bir sonuçtur,
        // zincir burada durur ve rapora olduğu gibi yansıtılır.
        expect(liveAnalysis.candidates.length).toBe(0);
        return;
      }

      const candidate = liveAnalysis.candidates[0];
      const facts = await prisma.foodNutritionFacts.findUnique({
        where: { foodId: candidate.food_id },
      });
      expect(facts).not.toBeNull();

      // KULLANICI ONAYI SİMÜLASYONU: AI'nin tahmini (estimated_weight_g)
      // hiçbir zaman doğrudan kullanılmaz — kullanıcı DEĞİŞTİRİR/onaylar.
      const userConfirmedWeightG = Math.round(liveAnalysis.estimated_weight_g) + 25;

      const mealItem = await createMealItemForUser(userId, {
        food_id: candidate.food_id,
        consumed_weight_g: userConfirmedWeightG,
        meal_type: "SNACK",
      });

      const factor = userConfirmedWeightG / 100;
      const expectedKcal = roundToOneDecimal(facts!.energyKcalPer100g * factor);
      const expectedProtein = roundToOneDecimal(facts!.proteinGPer100g * factor);

      // GERÇEK ADIM 16 hesabı — AI'DAN DEĞİL, facts + kullanıcı onaylı
      // ağırlıktan gelir.
      expect(mealItem.energyKcal).toBe(expectedKcal);
      expect(mealItem.proteinG).toBe(expectedProtein);
      expect(mealItem.consumedWeightG).toBe(userConfirmedWeightG);
      expect(mealItem.userId).toBe(userId);

      const summary = await getDailySummaryForUser(userId, new Date());
      expect(summary.item_count).toBe(1);
      expect(summary.energy_kcal).toBe(expectedKcal);
    });
  },
);
