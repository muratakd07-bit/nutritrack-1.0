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

## AI (fotoğraftan besin tanıma) — ayrı ve hâlâ bağlı değil

[`foodRecognition.ts`](./foodRecognition.ts), `contract.ts`'ten BİLİNÇLİ
OLARAK ayrı bir sözleşmedir. Bir görsel tanıma sağlayıcısı (vendor/model)
henüz bağlanmadı; varsayılan implementasyon
`FoodRecognitionNotImplementedError` fırlatır.

**Kritik ayrım:** `FoodRecognitionEstimate.estimated_weight_g` (AI tahmini,
doğrulanmamış) hiçbir zaman doğrudan `getCalculatedNutrition`'a girmez.
Kullanıcı tahmini onaylayıp/düzeltip bir `MealItemInput.consumed_weight_g`
(doğrulanmış) haline getirmeden hesaplama tetiklenmez.

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
