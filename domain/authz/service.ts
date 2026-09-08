import { authzRepository } from "./repository";
import type { UserRole } from "@/types/authz";

export class ForbiddenError extends Error {
  constructor(message = "Bu işlem için yetkiniz yok") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Bir kullanıcının rolünü döner. TEK kaynağı veritabanıdır — client'tan
 * gönderilen hiçbir role/userId değeri burada kullanılmaz; `userId` her
 * zaman `lib/auth/session.ts` → `getAuthenticatedUserId()`'nin (yani
 * Supabase JWT'sinin) döndürdüğü, sunucu tarafında doğrulanmış kimlik
 * olmalıdır.
 */
export async function getRoleForUser(userId: string): Promise<UserRole> {
  const role = await authzRepository.getUserRole(userId);
  // Kayıt bulunamazsa (olmaması gereken bir durum) en düşük yetkiye düşülür.
  return role ?? "USER";
}

/** `userId`'nin rolü `allowed` listesinde değilse ForbiddenError fırlatır. */
export async function requireRole(
  userId: string,
  allowed: UserRole[],
): Promise<UserRole> {
  const role = await getRoleForUser(userId);
  if (!allowed.includes(role)) {
    throw new ForbiddenError();
  }
  return role;
}

/**
 * `trainerUserId`, `clientUserId` için atanmış (ve gerçekten TRAINER rolüne
 * sahip) bir trainer mı? Öyleyse Trainer.id'sini döner (goals yazma gibi
 * işlemler bu id'yi ister); değilse `null` döner.
 */
export async function resolveAssignedTrainerId(
  trainerUserId: string,
  clientUserId: string,
): Promise<string | null> {
  const role = await getRoleForUser(trainerUserId);
  if (role !== "TRAINER") {
    return null;
  }

  const trainerId = await authzRepository.getTrainerProfileIdForUser(
    trainerUserId,
  );
  if (!trainerId) {
    return null;
  }

  const isAssigned = await authzRepository.isTrainerAssignmentActive(
    trainerId,
    clientUserId,
  );
  return isAssigned ? trainerId : null;
}

/**
 * `actorUserId`, `targetUserId`'nin verisine erişebilir mi?
 *  - kendi verisiyse: her zaman evet
 *  - actor ADMIN ise: her zaman evet
 *  - actor TRAINER ve targetUserId'ye atanmışsa: evet
 *  - aksi halde: hayır
 */
export async function canAccessUserData(
  actorUserId: string,
  targetUserId: string,
): Promise<boolean> {
  if (actorUserId === targetUserId) {
    return true;
  }

  const role = await getRoleForUser(actorUserId);
  if (role === "ADMIN") {
    return true;
  }
  if (role === "TRAINER") {
    const trainerId = await resolveAssignedTrainerId(
      actorUserId,
      targetUserId,
    );
    return trainerId !== null;
  }

  return false;
}

/** `canAccessUserData` false dönerse ForbiddenError fırlatır. */
export async function requireAccessToUserData(
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const allowed = await canAccessUserData(actorUserId, targetUserId);
  if (!allowed) {
    throw new ForbiddenError();
  }
}

/** Bir trainer'a atanmış tüm client user id'lerini döner (trainer-only kullanım için). */
export async function listAssignedClientIds(
  trainerUserId: string,
): Promise<string[]> {
  const trainerId = await authzRepository.getTrainerProfileIdForUser(
    trainerUserId,
  );
  if (!trainerId) {
    return [];
  }
  return authzRepository.listAssignedClientIds(trainerId);
}

/**
 * Admin işlemi: bir trainer'ı bir client'a atar. Hedef kullanıcının gerçekten
 * TRAINER rolüne sahip olduğu doğrulanır (rastgele bir kullanıcı "trainer"
 * gibi atanamaz).
 */
export async function createTrainerAssignment(
  trainerUserId: string,
  clientUserId: string,
): Promise<void> {
  const role = await getRoleForUser(trainerUserId);
  if (role !== "TRAINER") {
    throw new ForbiddenError(
      "Hedef kullanıcı TRAINER rolüne sahip değil, atama yapılamaz",
    );
  }
  await authzRepository.createTrainerAssignment(trainerUserId, clientUserId);
}
