-- NutriTrack — Row Level Security (RLS) politikaları.
--
-- NE ZAMAN ÇALIŞTIRILIR: Bu dosya Prisma migration akışının BİR PARÇASI
-- DEĞİLDİR. `auth.uid()` fonksiyonu yalnızca gerçek bir Supabase projesinde
-- (Supabase'in kendi `auth` şemasıyla birlikte) var olur; yerel Postgres'te
-- veya Docker'da bu fonksiyon bulunmaz. Bu nedenle:
--   1. Prisma migration'ları (`npx prisma migrate deploy`) önce çalıştırılır,
--   2. Ardından bu dosya, gerçek Supabase projesine Supabase SQL editöründen
--      veya `supabase db execute` ile bir kez uygulanır.
--
-- NEDEN GEREKLİ: Next.js API katmanımız bugün her sorguda `WHERE user_id = ...`
-- ile uygulama-seviyesinde izolasyon uyguluyor (bkz. domain/meal/repository.ts).
-- Ancak ileride bir mobil uygulama Supabase'e DOĞRUDAN (bizim API'mizi
-- atlayarak) bağlanırsa, tek güvenlik katmanı olarak veritabanı seviyesinde
-- RLS gerekir. Bu dosya o savunma katmanını tanımlar (defense in depth).

alter table "meals" enable row level security;
alter table "meal_items" enable row level security;
alter table "daily_nutrition_goals" enable row level security;

-- Kullanıcı yalnızca kendi meal/meal_item/goal kayıtlarını görebilir ve yazabilir.
create policy "meals_owner_isolation"
  on "meals"
  for all
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

create policy "meal_items_owner_isolation"
  on "meal_items"
  for all
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- Hedefler için: kullanıcı kendi hedeflerini OKUYABİLİR ama YAZAMAZ.
-- Yazma (INSERT/UPDATE) yalnızca uygulamanın service-role bağlantısı
-- (trainer/system API rotaları) üzerinden yapılır — bkz. domain/goals/service.ts.
create policy "daily_nutrition_goals_owner_read"
  on "daily_nutrition_goals"
  for select
  using (user_id = auth.uid()::text);
