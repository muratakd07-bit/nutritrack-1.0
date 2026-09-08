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

-- ÖNEMLİ: RLS yalnızca SATIR filtrelemesi yapar; Postgres önce TABLO
-- seviyesinde temel yetkiyi (GRANT) kontrol eder. Bu grant'lar olmadan
-- "authenticated" rolü RLS politikasına hiç ulaşamadan "permission denied"
-- hatası alır — yani RLS "çalışmıyormuş" gibi görünür, aslında hiç
-- devreye girmemiş olur. `anon` rolüne kasıtlı olarak HİÇBİR grant
-- verilmiyor (kimlik doğrulanmamış istekler bu tablolara hiç erişmemeli).
grant select, insert, update, delete on "meals" to authenticated;
grant select, insert, update, delete on "meal_items" to authenticated;
grant select on "daily_nutrition_goals" to authenticated;

-- ÖNEMLİ: Prisma şemasındaki alanlar camelCase (userId) ve hiçbir field'da
-- @map("...") kullanılmıyor. Bu nedenle Prisma'nın oluşturduğu gerçek Postgres
-- sütunu "userId" (tırnaklı, camelCase) olur — "user_id" (snake_case) DEĞİL.
-- Postgres'te tırnaksız tanımlayıcılar küçük harfe çevrildiği için burada
-- sütun adı MUTLAKA çift tırnakla ("userId") yazılmalı, aksi halde
-- "column user_id does not exist" hatası alınır.
--
-- Politikalar `drop policy if exists` ile öncelenir ki bu dosya güvenle
-- tekrar tekrar çalıştırılabilsin (idempotent).

-- Kullanıcı yalnızca kendi meal/meal_item/goal kayıtlarını görebilir ve yazabilir.
drop policy if exists "meals_owner_isolation" on "meals";
create policy "meals_owner_isolation"
  on "meals"
  for all
  using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);

drop policy if exists "meal_items_owner_isolation" on "meal_items";
create policy "meal_items_owner_isolation"
  on "meal_items"
  for all
  using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);

-- Hedefler için: kullanıcı kendi hedeflerini OKUYABİLİR ama YAZAMAZ.
-- Yazma (INSERT/UPDATE) yalnızca uygulamanın service-role bağlantısı
-- (trainer/system API rotaları) üzerinden yapılır — bkz. domain/goals/service.ts.
drop policy if exists "daily_nutrition_goals_owner_read" on "daily_nutrition_goals";
create policy "daily_nutrition_goals_owner_read"
  on "daily_nutrition_goals"
  for select
  using ("userId" = auth.uid()::text);
