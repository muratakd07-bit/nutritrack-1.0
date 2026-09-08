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

-- ============================================================================
-- ADIM 24 — Rol tabanlı erişim (RBAC), DB seviyesinde savunma katmanı.
--
-- Next.js API'miz bugün Prisma/postgres bağlantısıyla RLS'yi zaten bypass
-- ediyor; asıl yetki kontrolü domain/authz/service.ts'te yapılıyor. Aşağıdaki
-- politikalar, gelecekte bir istemcinin (mobil uygulama gibi) Supabase'e
-- DOĞRUDAN bağlanma ihtimaline karşı AYNI rol modelini veritabanı
-- seviyesinde de uygular (defense in depth) — uygulama katmanının yerini
-- almaz, onu yedekler.
-- ============================================================================

-- Rol/atama kontrollerini tekrarlamamak için iki yardımcı fonksiyon.
-- `security definer`: çağıran rolün (authenticated/anon) public.users veya
-- public.trainer_assignments üzerinde doğrudan SELECT yetkisi olmasa da bu
-- fonksiyonlar çalışabilir — yalnızca içeride tanımlı, sabit sorguyu çalıştırırlar.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role::text from public.users where id = auth.uid()::text;
$$;

create or replace function public.is_assigned_trainer_of(target_user_id text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.trainer_assignments ta
    join public.trainers t on t.id = ta."trainerId"
    where t."userId" = auth.uid()::text
      and ta."clientUserId" = target_user_id
  );
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_assigned_trainer_of(text) to authenticated;

-- ADMIN: her tabloda tam erişim.
drop policy if exists "meals_admin_full_access" on "meals";
create policy "meals_admin_full_access"
  on "meals"
  for all
  using (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "meal_items_admin_full_access" on "meal_items";
create policy "meal_items_admin_full_access"
  on "meal_items"
  for all
  using (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "daily_nutrition_goals_admin_full_access" on "daily_nutrition_goals";
create policy "daily_nutrition_goals_admin_full_access"
  on "daily_nutrition_goals"
  for all
  using (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');

-- TRAINER: yalnızca kendisine ATANMIŞ client'ların meal/meal_item verisini
-- OKUYABİLİR (yazamaz — öğünü her zaman kullanıcının kendisi girer).
drop policy if exists "meals_trainer_read_assigned" on "meals";
create policy "meals_trainer_read_assigned"
  on "meals"
  for select
  using (public.is_assigned_trainer_of("userId"));

drop policy if exists "meal_items_trainer_read_assigned" on "meal_items";
create policy "meal_items_trainer_read_assigned"
  on "meal_items"
  for select
  using (public.is_assigned_trainer_of("userId"));

-- TRAINER: yalnızca kendisine ATANMIŞ client'lar için hedef OKUYABİLİR VE
-- YAZABİLİR (uygulama kuralı: hedefleri yalnızca trainer/system yazabilir).
drop policy if exists "daily_nutrition_goals_trainer_access" on "daily_nutrition_goals";
create policy "daily_nutrition_goals_trainer_access"
  on "daily_nutrition_goals"
  for all
  using (public.is_assigned_trainer_of("userId"))
  with check (public.is_assigned_trainer_of("userId"));
