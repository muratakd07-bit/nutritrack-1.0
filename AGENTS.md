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
snapshot'lanmış değerleri okur/toplar. Gerçek besin veritabanı ve hesaplama
algoritması henüz doğrulanmadığı için `contract.ts`'teki varsayılan
implementasyon bilinçli olarak `NutritionSourceNotImplementedError` fırlatır
— bu, gerçek ADIM 16 kaynağı bağlanana kadar BEKLENEN bir davranıştır,
uydurma bir değerle "çalışıyormuş gibi" davranılmaz.

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
