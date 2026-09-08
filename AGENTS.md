<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NutriTrack Mimari Kuralları

Bu bölüm `next dev` tarafından yönetilmez, kalıcıdır ve proje boyunca
geçerlidir.

## KRİTİK KURAL — ADIM 16 Nutrition Source of Truth

`calculated_nutrition` (energy_kcal, protein_g, carbohydrates_g, fat_g,
fiber_g), NutriTrack'in **TEK** nutrition source of truth'udur. Bu sözleşme
[`domain/nutrition/contract.ts`](domain/nutrition/contract.ts) içinde
tanımlıdır; ayrıntılar için [`domain/nutrition/README.md`](domain/nutrition/README.md)'ye bakın.

Hiçbir frontend, API endpoint, rapor, coach/AI, personalization, analytics
veya notification modülü bu değerleri kendi içinde **yeniden hesaplayamaz**.
Bir modülün nutrition değerine ihtiyacı varsa, ya ADIM 16 sözleşmesini
(`NutritionSourceOfTruth`) çağırır ya da zaten hesaplanıp `MealItem` üzerinde
snapshot'lanmış değerleri okur/toplar.

**ADIM 25 güncellemesi:** Hesaplama MEKANİZMASI artık gerçek —
`domain/nutrition/calculation.ts` (saf, deterministik, 100g→consumed_weight_g
ölçekleme) + `domain/nutrition/repository.ts` (`FoodNutritionFacts`
okuma). Ama `FoodNutritionFacts` verisi hâlâ uydurulmuyor: tablo boş
başlar, yalnızca ADMIN rolü `domain/foods/service.ts` →
`createVerifiedFood` ile (zorunlu `source`/`source_ref` izlenebilirliğiyle)
gerçek veri girebilir. Bir food için facts yoksa `contract.ts`
`FoodNutritionFactsNotFoundError` fırlatır (`NutritionSourceNotImplementedError`
DEĞİL artık — mekanizma çalışıyor, sadece o besinin verisi eksik).
Fotoğraftan besin tanıma (AI) `domain/nutrition/foodRecognition.ts`'te
BİLİNÇLİ OLARAK ayrı bir sözleşme, henüz bir vendor bağlanmadı; AI'nin
`estimated_weight_g`'si asla doğrudan hesaplamaya girmez, önce kullanıcı
onayıyla `consumed_weight_g`'ye dönüşmesi gerekir. Detaylar:
[`domain/nutrition/README.md`](domain/nutrition/README.md).

**ADIM 26 güncellemesi:** `FoodNutritionFacts`'e gerçek veri girmenin bir
yolu daha var: `domain/foods/importUsdaFoods.ts` (USDA FoodData Central'dan
idempotent toplu import — `(source, sourceRef)` üzerinde DB-seviyesi
`@@unique` kısıtı, `FoodImportRun` ile audit, `scripts/import-usda-foods.ts`
CLI'ı, `USDA_FDC_API_KEY` env değişkeni). Alan eşlemesi, provenance,
duplicate/merge stratejisi ve DEMO_KEY rate limit gerçeği:
[`domain/foods/README.md`](domain/foods/README.md).

**ADIM 27 güncellemesi:** Fotoğraftan besin tanıma akışı eklendi —
`domain/nutrition/photoAnalysis.ts` (orkestrasyon), `domain/foods/foodMatcher.ts`
(AI'nin isimlerini gerçek food_id'lere eşler: önce yerel DB, sonra
kontrollü USDA fallback+otomatik import), `app/api/meals/analyze-photo/route.ts`
(kimlik doğrulama + kullanıcı-başı rate limit + upload validasyonu + AI
çıktı doğrulaması; HİÇBİR MealItem OLUŞTURMAZ — stateless öneri döner).
`domain/nutrition/qwen3vlClient.ts` yazıldı ama gerçek bir Qwen3-VL
endpoint'ine karşı DOĞRULANAMADI (henüz bağlı değil) — bu yüzden
"production-ready" değildir; `QWEN3_VL_ENDPOINT_URL` tanımlı değilse
501 döner. Test/geliştirme için `AI_FOOD_RECOGNITION_MODE=mock`
(`domain/nutrition/foodRecognitionMock.ts`, deterministik) kullanılabilir
— production'da ASLA açık bırakılmamalı. Detaylar:
[`domain/nutrition/README.md`](domain/nutrition/README.md).

## Katmanlar

- `app/` — UI (App Router). `app/api/**/route.ts` — API/backend.
- `domain/` — iş mantığı, katman katman ayrılmış: `nutrition/` (ADIM 16
  sınırı), `meal/`, `goals/`, `reports/`, `coach/`.
- `lib/db/` — Prisma client singleton. `lib/auth/` — Supabase Auth
  entegrasyonu (fail-closed: oturum yoksa/yapılandırılmamışsa `null`, ASLA
  varsayılan kullanıcıya düşülmez). `lib/validation/` — zod şemaları.
  `lib/utils/` — saf yardımcı fonksiyonlar.
- `types/` — paylaşılan TypeScript tipleri (merkezi, `any` yok).
- `prisma/schema.prisma` — veritabanı şeması (PostgreSQL). Prisma 7
  kullanıyoruz: bağlantı `datasource.url` yerine `prisma.config.ts` (CLI)
  ve `lib/db/prisma.ts` içindeki `@prisma/adapter-pg` (runtime) üzerinden
  sağlanır.
- `supabase/rls-policies.sql` — yalnızca gerçek bir Supabase projesine
  bağlanınca uygulanır (Prisma migration akışının parçası değildir).

## Diğer kalıcı kurallar

- Günlük nutrition hedefleri (`daily_nutrition_goals`) yalnızca trainer veya
  sistem tarafından yazılabilir (`domain/goals/service.ts` →
  `setGoalsForUser`). AI/coach modülleri yalnızca okur
  (`domain/coach/readModel.ts` → `getCoachContext`).
- User isolation: her sorgu `userId` ile scope'lanır
  (`domain/meal/repository.ts`, `domain/goals/repository.ts`). Bir
  kullanıcı asla başka bir kullanıcının kaydına erişemez.
- Yeni bağımlılık eklerken `npm view <paket> dist-tags` ile `latest`
  etiketinin gerçekten kararlı (stable) bir sürüm olduğunu doğrulayın —
  bu projede `prisma`'nın `latest` etiketi bir release candidate'e
  (8.0.0-rc.x) işaret ediyordu; kararlı sürüm (`prisma@7.x`) açıkça
  sabitlenmiştir.
- Next.js 16'da `middleware.ts` dosya konvansiyonu deprecated —
  yerine kök dizinde `proxy.ts` (export edilen fonksiyon adı `proxy`)
  kullanılır. Bu projede oturum/token yenileme mantığı `proxy.ts`
  içindedir (`middleware.ts` DEĞİL).
- Auth: `lib/auth/supabaseServerClient.ts` / `supabaseBrowserClient.ts`
  hazır; `proxy.ts` her istekte oturumu yeniler. Login/signup sayfaları
  `app/login/`, `app/signup/`; e-posta onay linki `app/auth/callback/`.
  `public.users` satırı, gerçek Supabase projesine uygulanan
  `supabase/auth-triggers.sql` (auth.users → public.users trigger'ı) ile
  otomatik oluşturulur — bu dosya da RLS gibi Prisma migration akışının
  parçası değildir, ayrıca uygulanması gerekir.
- **RBAC (ADIM 24):** Roller `USER`/`TRAINER`/`ADMIN` — TEK kaynağı
  `User.role` (veritabanı). `system/service` bir rol DEĞİLDİR; server-side
  kodun kendisidir, hiçbir API'den tetiklenmez. Authorization mantığı
  `domain/authz/` içinde toplanır (authentication'dan — `lib/auth/` —
  kesin olarak ayrı). API route'ları `lib/authz/guard.ts` →
  `requireUserId()`/`mapAuthErrorToResponse()` ile 401/403'ü tek yerden
  yönetir. Yeni bir kullanıcıyı TRAINER/ADMIN yapmak (rol atamak) hiçbir
  API'den yapılamaz — kasıtlı olarak operasyonel/DB-seviyesi bir adımdır.
  RLS de aynı rol modelini DB seviyesinde tekrarlar (defense in depth) —
  bkz. `supabase/rls-policies.sql`, `public.current_user_role()` ve
  `public.is_assigned_trainer_of()`.
