import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { ForbiddenError } from "@/domain/authz/service";

/**
 * API route'larının ortak giriş noktası. Buradaki iki hata tipi ve
 * `mapAuthErrorToResponse`, her route'ta 401/403'ü elle yazmak yerine
 * tekrar kullanılır (bkz. domain/authz/README.md, kural: "her route'ta
 * farklı kontrol yazma").
 */
export class UnauthenticatedError extends Error {
  constructor() {
    super("Kimlik doğrulanamadı");
    this.name = "UnauthenticatedError";
  }
}

/** Oturum yoksa UnauthenticatedError fırlatır; varsa doğrulanmış userId'yi döner. */
export async function requireUserId(): Promise<string> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new UnauthenticatedError();
  }
  return userId;
}

/**
 * `UnauthenticatedError` → 401, `ForbiddenError` → 403. Eşleşme yoksa `null`
 * döner — çağıran taraf hatayı yeniden fırlatmalı (Next.js'in genel 500
 * işleyicisine düşer).
 */
export function mapAuthErrorToResponse(error: unknown): NextResponse | null {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
