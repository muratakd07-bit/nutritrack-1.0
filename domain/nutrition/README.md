# ADIM 16 — Nutrition Source of Truth Sınırı

Bu klasör, NutriTrack'in **tek nutrition source of truth**'u olan ADIM 16
sözleşmesinin mimari sınırını tanımlar.

## Kural

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

Toplama (aggregation) bu kuralı ihlal etmez: zaten hesaplanmış değerleri
toplamak (`domain/reports/dailySummary.ts`) yeni bir nutrition sonucu
**üretmek** değildir.

## Neden şu an bir implementasyon yok

Gerçek besin veritabanı ve hesaplama algoritması bu projede henüz
doğrulanmadı. Bu nedenle `contract.ts` içindeki varsayılan implementasyon
bilinçli olarak `NutritionSourceNotImplementedError` fırlatır — sessizce
uydurma bir değer üretmek yerine.

## ADIM 16 bağlandığında yapılması gereken

1. Gerçek veri kaynağı/algoritma netleştiğinde, `NutritionSourceOfTruth`
   arayüzünü implemente eden **yeni bir sınıf/servis** yazılır (ör.
   `Adim16NutritionSource implements NutritionSourceOfTruth`).
2. `nutritionSourceOfTruth` export'u bu yeni implementasyonu kullanacak
   şekilde güncellenir.
3. Arayüz (`getCalculatedNutrition(input): Promise<CalculatedNutrition>`)
   **değişmez** — böylece onu çağıran `domain/meal/service.ts` gibi hiçbir
   tüketici kodun değişmesi gerekmez.

## Testlerde kullanım

Testler gerçek implementasyon yerine sahte (fake) bir
`NutritionSourceOfTruth` enjekte edebilir — bkz.
`domain/meal/service.test.ts`. Bu sahte değerler asla gerçek besin verisi
olarak sunulmamalı, yalnızca "ADIM 16'nın döndürdüğü değer değiştirilmeden
kaydediliyor mu?" davranışını test etmek için kullanılmalıdır.
