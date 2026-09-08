# ADIM 16 — Nutrition Source of Truth

Bu klasör, NutriTrack'in **tek nutrition source of truth**'u olan ADIM 16
sözleşmesini barındırır.

## Kural (değişmedi)

`calculated_nutrition` (energy_kcal, protein_g, carbohydrates_g, fat_g,
fiber_g) değerlerini üretebilecek **tek yer** [`contract.ts`](./contract.ts)
içindeki `NutritionSourceOfTruth` implementasyonudur.

Hiçbir modül (frontend, API route, rapor, coach/AI, analytics, notification,
personalization) bu değerleri:

- kendi formülüyle hesaplayamaz,
- varsayılan/tahmini bir sayı ile doldurup sonradan "gerçek" gibi
  kullanamaz,
- ADIM 16 dışında başka bir kaynaktan (ör. üçüncü parti bir API'den
  doğrudan) çekip veritabanına yazamaz.

Toplama (aggregation) bu kuralı ihlal etmez — bkz. `domain/reports/dailySummary.ts`.

## ADIM 25: Hesaplama motoru artık GERÇEK

`contract.ts` artık `NutritionSourceNotImplementedError` fırlatmıyor.
Gerçek, deterministik bir hesaplama zinciri var:

1. [`repository.ts`](./repository.ts) — `food_id` için doğrulanmış 100g
   başına değerleri (`FoodNutritionFacts` tablosu) okur.
2. [`calculation.ts`](./calculation.ts) — SAF bir fonksiyonla
   (`scaleNutritionFactsToWeight`) bu değerleri `consumed_weight_g`'ye
   doğrusal olarak ölçekler ve 1 ondalığa yuvarlar.
3. Facts bulunamazsa `FoodNutritionFactsNotFoundError` fırlatılır — bu,
   "mekanizma implemente edilmedi" değil, "bu belirli besinin verisi henüz
   girilmedi" anlamına gelir.

## Veri hâlâ uydurulmuyor

`FoodNutritionFacts` tablosu **boş başlar** ve bu proje hiçbir zaman
buraya kendiliğinden bir değer yazmaz. Gerçek, doğrulanmış veri yalnızca
ADMIN rolü tarafından [`domain/foods/service.ts`](../foods/service.ts) →
`createVerifiedFood` üzerinden, bir `source`/`source_ref` (ör.
"USDA_FDC" + FDC id) ile birlikte girilir — bkz.
`app/api/admin/foods/route.ts`. Otomatik kod (Claude dahil) bir besinin
gerçek kalori/makro değerini asla kendisi üretip bu tabloya yazmaz.

## AI (fotoğraftan besin tanıma) — ADIM 27, hâlâ ayrı, gerçek vendor'a bağlı değil

[`foodRecognition.ts`](./foodRecognition.ts), `contract.ts`'ten BİLİNÇLİ
OLARAK ayrı bir sözleşmedir. `QWEN3_VL_ENDPOINT_URL` tanımlı değilse
varsayılan implementasyon `FoodRecognitionNotImplementedError` fırlatır —
[`qwen3vlClient.ts`](./qwen3vlClient.ts) yazıldı ama **gerçek bir Qwen3-VL
endpoint'ine karşı canlı doğrulanamadı** (USDA entegrasyonunun aksine —
bkz. dosyanın kendi üstündeki not). Bu yüzden bu entegrasyon
"production-ready" DEĞİLDİR.

Akış (ADIM 27): fotoğraf → [`foodRecognition.ts`](./foodRecognition.ts)
(aday İSİMLER + tahmini ağırlık + görsel açıklama, food_id DEĞİL) →
şema doğrulaması (bkz. `lib/validation/foodRecognition.ts` — confidence
[0,1]'e, ağırlık gerçekçi bir üst sınıra sıkıştırılır; bu, manipüle
edilmiş/"prompt injection" içeren bir görselin saçma bir değeri modele
"söyletmesine" karşı savunmadır) → [`domain/foods/foodMatcher.ts`](../foods/foodMatcher.ts)
(isimden GERÇEK food_id'ye eşleme: önce yerel DB, gerekiyorsa kontrollü
USDA fallback + otomatik import) → [`photoAnalysis.ts`](./photoAnalysis.ts)
(orkestrasyon + belirsizlik/düşük-güven tespiti) → **KULLANICI ONAYI** →
`MealItemInput` → `domain/meal/service.ts` (DEĞİŞMEDİ) →
`contract.ts` (bu dosya, DEĞİŞMEDİ).

**Kritik ayrım (değişmedi, şimdi daha somut):** `PhotoAnalysisResult`'ın
hiçbir alanı (`estimated_weight_g` dahil) `MealItemInput`'un gerektirdiği
alanlarla (`food_id`, `consumed_weight_g`, `meal_type`) AYNI ŞEKİLDE
adlandırılmamıştır — bu, kullanıcı seçim/düzeltme yapmadan bir analiz
sonucunun yanlışlıkla doğrudan meal item'a "sızmasını" tip sistemi
seviyesinde de zorlaştırır. `app/api/meals/analyze-photo/route.ts` HİÇBİR
MealItem oluşturmaz — yalnızca öneri döner (stateless, sunucuda
saklanmaz). Onay, istemcinin AYNI, değişmemiş `POST /api/meals`'e normal
bir `MealItemInput` göndermesiyle olur.

## Snapshot değişmezliği

`domain/foods/repository.ts` → `upsertNutritionFacts`, bir besinin
değerlerini İLERİDE düzeltmeye izin verir (ör. yanlış girilen bir değerin
düzeltilmesi) — ama bu, o ana kadar oluşturulmuş `MealItem` kayıtlarını
ASLA etkilemez, çünkü `MealItem` facts'e canlı referans vermez, hesaplama
anındaki değerin kendi kopyasını (snapshot) taşır.

## Testlerde kullanım

- `contract.test.ts`, `calculation.test.ts`, `foodRecognition.test.ts` —
  mantık seviyesinde (mock'lu repository).
- `domain/meal/service.test.ts` — sahte (fake) bir `NutritionSourceOfTruth`
  enjekte ederek meal domain'inin ADIM 16 çıktısını değiştirmeden
  kaydettiğini test eder; bu sahte değerler asla gerçek besin verisi olarak
  sunulmamalıdır.
