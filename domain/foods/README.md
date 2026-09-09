# Foods Domain — Gerçek Veri Girişi ve İmport (ADIM 26)

Bu klasör, `FoodNutritionFacts`'e (ADIM 16'nın tek veri kaynağı) gerçek,
doğrulanabilir veri girmenin İKİ yolunu barındırır:

1. **Manuel/admin girişi** — `service.ts` → `createVerifiedFood`, `app/api/admin/foods/route.ts` (ADMIN-only).
2. **Toplu import** — `importUsdaFoods.ts`, USDA FoodData Central'dan.

## Veri kaynağı kararı: USDA FoodData Central

- **Neden:** Kamu malı (CC0 1.0 — telif hakkı yok, atıf zorunlu değil ama
  önerilir), ücretsiz REST API, "Foundation"/"SR Legacy" veri tipleri
  laboratuvar-analizli ve güvenilir, alan bazında izlenebilir
  (`fdcId` = kalıcı, sorgulanabilir kimlik).
- **Doğrulama:** Bu tasarım, hafızaya değil 2026-09-08'de fdc.nal.usda.gov'a
  yapılan CANLI API çağrılarına dayanır (gerçek nutrient numaraları ve
  yanıt şekli doğrulandı — bkz. `usdaMapper.test.ts`'teki gerçek fixture).

## Alan eşlemesi (mapping)

| USDA nutrient number | USDA adı | Bizim alanımız |
|---|---|---|
| 208 | Energy (kcal) | `energyKcalPer100g` |
| 203 | Protein (g) | `proteinGPer100g` |
| 205 | Carbohydrate, by difference (g) | `carbohydratesGPer100g` |
| 204 | Total lipid (fat) (g) | `fatGPer100g` |
| 291 | Fiber, total dietary (g) | `fiberGPer100g` |

Kaynak: `domain/foods/usdaTypes.ts` → `USDA_NUTRIENT_NUMBER`.

## Normalizasyon / birim

USDA'nın Foundation ve SR Legacy veri tipleri, bu 5 nutrient'i **zaten
100g başına** ve **doğru birimde** (kcal, g) raporlar — birim dönüşümü
gerekmez. `unitName` alanı yine de her yanıtta mevcuttur; ileride "Branded"
veri tipi (porsiyon bazlı, farklı birimler olabilir) desteklenmek
istenirse bu alan kullanılarak dönüşüm eklenmelidir — **şu an bu proje
yalnızca Foundation/SR Legacy ile çalışır, Branded desteklenmez.**

## Yuvarlama

100g başına değerler ham (yuvarlanmamış) saklanır — yuvarlama yalnızca
`domain/nutrition/calculation.ts`'te, tüketilen ağırlığa ölçeklendikten
SONRA, 1 ondalık basamağa yapılır (ADIM 25'te belirlenen kural, burada
değişmedi).

## Provenance (source / sourceRef)

- `source = "USDA_FDC"` (sabit).
- `sourceRef = String(fdcId)` — USDA'nın kendi kalıcı kimliği. Herkes
  `https://fdc.nal.usda.gov/food-details/{fdcId}/nutrients` adresinden
  bağımsız olarak doğrulayabilir.
- `(source, sourceRef)` üzerinde DB seviyesinde `@@unique` kısıtı var
  (bkz. `prisma/schema.prisma`) — idempotency'nin garantisi burada.

## Türkçe isimler

**Şimdilik yapılmıyor.** İçe aktarılan `Food.name`, USDA'nın İngilizce
`description` alanının birebir kopyasıdır. Neden:

- Bir besinin adının çevirisi bir "gerçek" gibi doğrulanamaz (nutrition
  değerinin aksine, çeviri kalitesi öznel/hataya açıktır) — bu proje
  boyunca kurduğumuz "doğrulanmamış içerik üretme" ilkesiyle tutarlı
  olarak, Claude/otomatik kod bir çeviriyi "doğru" diye sunmaz.
- Önerilen ileriki adım: `Food` modeline opsiyonel bir `nameTr` alanı
  eklemek ve bunu ya (a) admin/trainer'ların elle düzelttiği bir alan
  olarak, ya da (b) ayrı, açıkça belgelenmiş bir çeviri kaynağı/servisi
  bağlanınca doldurmak. Bu ADIM'ın kapsamı dışında bırakıldı.

## Duplicate / merge stratejisi

- **Aynı `fdcId` tekrar import edilirse:** `(USDA_FDC, fdcId)` zaten
  varsa **"duplicate"** sayılır, DB'ye HİÇBİR YAZMA yapılmaz (ne yeni
  satır, ne güncelleme).
- **Manuel/admin girişli bir kayıt (`source != "USDA_FDC"`) asla
  ezilmez:** import her zaman `source="USDA_FDC"` ile arama yapar; farklı
  bir `source`'a sahip satırlar bu sorgunun sonucuna hiç girmez — bu
  yapısal bir izolasyon, çalışma zamanı kontrolüne dayanmaz.
- **Aynı gerçek besinin USDA'da VE admin tarafından ayrı ayrı girilmesi**
  (ör. "Tavuk Göğsü" hem manuel hem USDA'dan): bu sürümde tespit
  edilmez/birleştirilmez (iki ayrı `Food` satırı olarak var olur). Gerçek
  bir "aynı besin mi" eşleştirmesi (isim benzerliği, GTIN/barkod vb.)
  gerektirir — kasıtlı olarak bu ADIM'ın kapsamı dışında bırakıldı, ileride
  admin'e "olası duplicate" uyarısı gösteren bir eşleştirme katmanı
  eklenebilir.

## Batch / transaction

`importUsdaFoods.ts`, `BATCH_SIZE=20` food'luk gruplar halinde çalışır;
her grup kendi `prisma.$transaction`'ında yazılır. Büyük bir dataset
(ör. binlerce food) TEK bir transaction'a bağlanmaz — bir grupta hata
olursa yalnızca o grup geri alınır, önceki gruplar kalıcıdır.

## Audit

Her `importUsdaFoods` çağrısı, `FoodImportRun` tablosuna bir satır yazar:
`source`, `requestedCount`, `importedCount`, `duplicateCount`,
`mappingErrorCount`, `skippedCount`, ve besin-bazında detaylar (`details`,
JSON). Bu, "kaç şey oldu" sorusunun ANLIK bir konsol çıktısı değil,
kalıcı/sorgulanabilir bir cevabıdır.

## FoodMatcher candidate ranking (ADIM 27 düzeltmesi)

`domain/foods/foodMatcher.ts`, AI'nin döndürdüğü serbest metin bir
etiketi (ör. "rice") gerçek bir `Food` kaydına eşler — bu README'nin
kapsamındaki import mekanizmasını KULLANIR (USDA fallback bulduğu
adayları `importUsdaFoods` ile aynı şekilde import eder), ama eşleştirme
mantığının kendisi ayrı bir dosyada, `domain/foods/foodMatchScoring.ts`'te
yaşar.

**Gerçek bir hata (ADIM 27'nin canlı fotoğraf testinde bulundu):** Eski
kod, USDA arama sonucunun İLK elemanını sorgusuz "en iyi eşleşme" kabul
ediyordu. Bir tabak fotoğrafında AI "rice" ve "salad" dediğinde, bu
"Rice crackers" ve "Fish, tuna salad" kayıtlarına otomatik eşleşti — her
ikisi de GERÇEK, doğrulanmış USDA kayıtları, ama aranan şey için yanlış
kayıtlar. Bu iki kayıt bir kez import edildikten SONRA, "yerel eşleşmeler
her zaman güvenilirdir" kuralı onları gelecekteki her sorguda (USDA'ya
hiç bakmadan) tekrar öne çıkarmaya devam ediyordu.

**Düzeltme:** `foodMatchScoring.ts` → `scoreUsdaCandidate` /
`isOffTypeMatch` / `isSecondaryMentionOnly`, YALNIZCA `description`
alanına (USDA search yanıtında doğrulanmış tek metinsel alan) dayanan bir
sezgisel (heuristic) puanlama uygular: USDA'nın taksonomik "Ana besin,
tanımlayıcı, tanımlayıcı" formatını (baş segment eşleşmesi güçlü sinyal),
küçük bir "işlenmiş/türetilmiş ürün" kelime listesini (negation-farkında:
"without dressing" cezalandırılmaz), ve "sorgu yalnızca ikincil bir
segmentte mi geçiyor" kontrolünü birleştirir. Bu kontrol hem USDA
fallback adaylarına HEM DE zaten yerel DB'de olan adaylara uygulanır —
"yerel her zaman güvenilir" varsayımı artık her aday için ayrıca
doğrulanır; TÜM yerel adaylar şüpheliyse USDA'ya da bakılır ve iki
havuz birleştirilir.

**Kesin olarak DEĞİŞMEYEN şey:** FoodMatcher hâlâ nutrition değeri
üretmez/almaz — yalnızca `food_id` adayları (artık her biri
`requires_user_confirmation` bayrağıyla) önerir. Nihai seçim ve
`consumed_weight_g` onayı her zaman kullanıcıdadır (bkz.
`domain/nutrition/README.md`).

**Dürüstlük notu:** Bu bir tam semantik sınıflandırıcı değil, test edilmiş
bir sezgiseldir — ADIM 26'daki gibi USDA `DEMO_KEY`'in paylaşılan rate
limiti, bu düzeltmenin canlı "USDA'dan daha iyi bir alternatif buldu"
davranışını her an tekrar test etmeyi de zorlaştırır; birim testleri
(`foodMatcher.test.ts`, `foodMatchScoring.test.ts`) bu davranışı ağdan
bağımsız, deterministik olarak doğrular.

## Rate limit gerçeği (dürüstçe kaydedilmiş)

USDA'nın `DEMO_KEY`'i resmi olarak saatte 30, günde 50 istekle
sınırlıdır — ama bu, IP başına PAYLAŞILAN bir kotadır. Bu geliştirme
ortamının paylaşılan/bulut IP'sinde bu kota, ADIM 26 sırasında yapılan
yalnızca birkaç doğrulama çağrısıyla tükenmiştir (gözlemlenen gerçek
limit "10", muhtemelen başka kullanıcıların/oturumların aynı IP'yi
kullanması nedeniyle daha da düşük). **Gerçek/ölçekli bir import için
`USDA_FDC_API_KEY` ortam değişkenine kendi ücretsiz anahtarınızı
(https://api.data.gov/signup/) eklemeniz gerekir.**
