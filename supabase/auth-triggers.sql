-- NutriTrack — auth.users → public.users otomatik profil oluşturma.
--
-- NE ZAMAN ÇALIŞTIRILIR: supabase/rls-policies.sql ile aynı şekilde, yalnızca
-- gerçek bir Supabase projesine (auth şemasıyla birlikte) uygulanır. Yerel
-- Postgres'te `auth.users` tablosu olmadığı için burada da çalışmaz — Prisma
-- migration akışının parçası değildir.
--
-- NEDEN GEREKLİ: prisma/schema.prisma'daki User modeli, id'sinin Supabase
-- Auth'taki auth.users.id ile birebir aynı olmasını varsayar (bkz. şemadaki
-- yorum). Ancak signUp() çağrısı yalnızca auth.users'a satır ekler;
-- public.users'a otomatik bir satır eklemez. Bu trigger olmadan, yeni kayıt
-- olan bir kullanıcı adına ilk meal/goal kaydı oluşturulmaya çalışıldığında
-- foreign key ihlaliyle başarısız olur.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, "updatedAt")
  values (new.id, new.email, now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
