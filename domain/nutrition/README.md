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

## AI (fotoğraftan besin tanıma) — ADIM 27

[`foodRecognition.ts`](./foodRecognition.ts), `contract.ts`'ten BİLİNÇLİ
OLARAK ayrı bir sözleşmedir. `QWEN3_VL_BASE_URL`/`QWEN3_VL_API_KEY`
tanımlı değilse varsayılan implementasyon `FoodRecognitionNotImplementedError`
fırlatır.

[`qwen3vlClient.ts`](./qwen3vlClient.ts), Alibaba Cloud Model Studio
(DashScope) OpenAI-uyumlu modunu hedefler. **İstek/yanıt FORMATI**
2026-09-09'da `alibabacloud.com/help/en/model-studio/vision` adresinden
CANLI doğrulandı — USDA entegrasyonuyla (ADIM 26) aynı titizlikle,
varsayılmadı: `{base_url}/chat/completions`, görsel
`image_url: { url: "data:{mime};base64,{data}" }` (standart OpenAI
vision veri-URI'si), kimlik doğrulama `Authorization: Bearer <key>`,
yanıt `choices[0].message.content` (serbest metin — bu yüzden modele
YALNIZCA JSON döndürmesini isteyen bir prompt kullanılır ve dönen metin
ayrıştırılıp zod ile doğrulanır). Timeout (20sn) ve 5xx/ağ hatalarında
tek seferlik retry var; 4xx'te retry YOK.

**Ama CANLI ÇAĞRI hâlâ doğrulanamadı** — gerçek bir Qwen3-VL API key'i
yok, bu yüzden modelin prompt'a GERÇEKTEN nasıl yanıt verdiği (ör. JSON
formatına ne kadar sadık kaldığı) test edilemedi. Format dokümantasyona
göre doğru; davranış canlı doğrulanmadı. Bu yüzden bu entegrasyon
"production-ready" DEĞİLDİR.

Akış (ADIM 27, Storage ile güncellendi):
fotoğraf → istemci kendi private Storage klasörüne (`{userId}/...`,
bkz. `supabase/storage-setup.sql`) YÜKLER → yalnızca `storage_path`
referansı `POST /api/meals/analyze-photo`'ya gönderilir (büyük base64
payload API isteğine KONMAZ) → sunucu, ÇAĞIRANIN kendi oturumuna bağlı
(RLS'ye tabi) bir client'la dosyayı indirir (bkz. `lib/storage/mealPhotos.ts`)
→ [`foodRecognition.ts`](./foodRecognition.ts) (aday İSİMLER + tahmini
ağırlık + görsel açıklama, food_id DEĞİL) → şema doğrulaması (bkz.
`lib/validation/foodRecognition.ts` — confidence [0,1]'e, ağırlık
gerçekçi bir üst sınıra sıkıştırılır; bu, manipüle edilmiş/"prompt
injection" içeren bir görselin saçma bir değeri modele "söyletmesine"
karşı savunmadır) → [`domain/foods/foodMatcher.ts`](../foods/foodMatcher.ts)
(isimden GERÇEK food_id'ye eşleme: önce yerel DB, gerekiyorsa kontrollü
USDA fallback + otomatik import) → [`photoAnalysis.ts`](./photoAnalysis.ts)
(orkestrasyon + belirsizlik/düşük-güven tespiti) → **KULLANICI ONAYI** →
`MealItemInput` → `domain/meal/service.ts` (DEĞİŞMEDİ) →
`contract.ts` (bu dosya, DEĞİŞMEDİ).

## Fotoğraf saklama (ADIM 27)

Fotoğraflar Supabase Storage'ın PRIVATE `meal-photos` bucket'ında tutulur
(bkz. `supabase/storage-setup.sql`, canlı olarak
`supabase.com/docs/guides/storage/security/access-control`'dan
doğrulanmış RLS deseniyle). Her kullanıcı yalnızca kendi `{userId}/`
klasörüne yazabilir/okuyabilir (`storage.foldername(name)[1] = auth.uid()::text`).
Bucket seviyesinde `file_size_limit` (8MB) ve `allowed_mime_types`
(jpeg/png/webp) zorunlu kılınır; bu, uygulama-seviyesi doğrulamaya EK bir
katmandır, onun YERİNE geçmez — route hem indirilen dosyanın boyutunu/
mime tipini tekrar kontrol eder hem de zod ile input şeklini doğrular.
Hiçbir kalıcı/genel (public) URL üretilmez; erişim daima sahibinin
oturumu üzerinden, RLS ile denetlenir.

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
