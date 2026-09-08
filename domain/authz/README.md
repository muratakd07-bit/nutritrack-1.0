# Authorization (RBAC) — ADIM 24

Bu klasör, NutriTrack'teki yetkilendirme mantığının **tek kaynağıdır**.
Authentication (kimlik doğrulama, "sen kimsin") `lib/auth/` içinde;
authorization (yetkilendirme, "ne yapabilirsin") burada — bilinçli olarak
ayrı tutulmuştur.

## Roller

- `USER` — varsayılan. Yalnızca kendi verisini okuyabilir/yazabilir.
- `TRAINER` — kendisine `TrainerAssignment` ile atanmış client'ların
  verisini okuyabilir; yalnızca atandığı client'lar için
  `daily_nutrition_goals` yazabilir.
- `ADMIN` — herhangi bir kullanıcının verisine erişebilir, yönetim
  işlemleri yapabilir (ör. trainer ataması oluşturmak).
- **`system/service` bir rol DEĞİLDİR.** Bir `User.role` değeriyle temsil
  edilmez; server-side kodun kendisi (ör. `domain/goals/service.ts`'teki
  `{ type: "SYSTEM" }` aktörü) hiçbir HTTP endpoint'ine bağlı olmadan
  çalışır. Hiçbir API route'u "system" olarak çağrılamaz.

## Kesin kurallar

1. Rol bilgisi **yalnızca** `User.role` veritabanı sütunundan okunur
   (`authzRepository.getUserRole`). Client'tan gönderilen `role` alanı asla
   kullanılmaz/güvenilmez.
2. `userId` (aktörün kimliği) **yalnızca** `lib/auth/session.ts` →
   `getAuthenticatedUserId()`'den (Supabase JWT, sunucu tarafında
   doğrulanmış) gelir. Request body/query'deki `user_id` değerleri sadece
   "hedef" belirtmek için kullanılır, asla "kimsin" için değil — her hedef
   erişimi `canAccessUserData`/`requireAccessToUserData` ile denetlenir.
3. Yeni bir kullanıcıyı TRAINER/ADMIN yapmak (rol atamak) bu sürümde bir
   API üzerinden YAPILAMAZ — kasıtlı olarak. Bir kullanıcının kendi rolünü
   yükseltebileceği hiçbir uç nokta yoktur. Rol ataması operasyonel bir
   adımdır (güvenilir bir operatör tarafından veritabanında yapılır).
4. `createTrainerAssignment` yalnızca ADMIN tarafından çağrılabilir
   (bkz. `app/api/admin/trainer-assignments/route.ts`) ve hedefin gerçekten
   `TRAINER` rolünde olduğunu doğrular.

## Nereden kullanılır

- `lib/authz/guard.ts` — API route'larının ortak giriş noktası:
  `requireUserId()` (401) ve `mapAuthErrorToResponse()` (401/403 eşlemesi).
- `app/api/meals/route.ts`, `app/api/goals/route.ts` — `?user_id=` ile
  başka bir kullanıcının verisini görüntüleme, `requireAccessToUserData`
  ile denetlenir.
- `app/api/trainer/clients/route.ts` — TRAINER-only, kendi client
  listesini döner.
- `app/api/admin/trainer-assignments/route.ts` — ADMIN-only, atama
  oluşturur.
- `domain/goals/service.ts` — `setGoalsForUser`, TRAINER aktörü için
  `resolveAssignedTrainerId`'i çağırır (bkz. o dosyadaki not).
