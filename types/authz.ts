/**
 * Yetkilendirme (authorization) rolleri.
 *
 * KURAL: Bu değer HİÇBİR ZAMAN client'tan (request body/header/query) okunup
 * güvenilmez. Tek kaynağı `User.role` veritabanı sütunudur — bkz.
 * domain/authz/service.ts.
 *
 * `system/service` kasıtlı olarak burada yoktur: bu bir kullanıcı rolü değil,
 * server-side kodun (service-role/doğrudan DB bağlantısı) kendisidir — bkz.
 * domain/authz/README.md.
 */
export const USER_ROLES = ["USER", "TRAINER", "ADMIN"] as const;

export type UserRole = (typeof USER_ROLES)[number];
