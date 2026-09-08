-- NutriTrack — Meal Photos Storage kurulumu.
--
-- NE ZAMAN ÇALIŞTIRILIR: rls-policies.sql/auth-triggers.sql ile aynı desen —
-- yalnızca gerçek bir Supabase projesine (storage şemasıyla birlikte)
-- uygulanır, Prisma migration akışının parçası DEĞİLDİR.
--
-- KAYNAK: https://supabase.com/docs/guides/storage/security/access-control
-- (2026-09-09'da canlı olarak doğrulandı — storage.foldername() ve
-- policy örnekleri buradan alınmıştır, varsayılmamıştır).
--
-- TASARIM: Her fotoğraf `{auth.uid()}/{dosya}` yoluna yüklenir. RLS,
-- yolun İLK klasör segmentinin yükleyenin kendi auth.uid()'si olmasını
-- zorunlu kılar — bir kullanıcı başka bir kullanıcının klasörüne
-- yazamaz/okuyamaz. Bucket PRIVATE'tir (public=false); hiçbir kalıcı
-- genel URL üretilmez, erişim yalnızca sahibinin oturumuyla (RLS üzerinden)
-- mümkündür.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  8388608, -- 8MB — app/api/meals/analyze-photo/route.ts'teki uygulama-seviyesi limitle aynı.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meal_photos_owner_insert" on storage.objects;
create policy "meal_photos_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "meal_photos_owner_select" on storage.objects;
create policy "meal_photos_owner_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "meal_photos_owner_delete" on storage.objects;
create policy "meal_photos_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- NOT: UPDATE policy'si BİLİNÇLİ OLARAK yok — fotoğraflar değiştirilemez
-- (immutable), yalnızca yeni yüklenir veya silinir.
