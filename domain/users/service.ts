import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
}

/**
 * Kullanıcının KENDİ profil satırı (public.users). Satır henüz yoksa
 * (auth-triggers.sql uygulanmamışsa) `null` döner.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, role: true },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    role: user.role,
  };
}
