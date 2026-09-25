import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { getUserProfile } from "@/domain/users/service";

/** GET /api/me — oturumdaki kullanıcının kendi profili (e-posta, rol). */
export async function GET() {
  try {
    const userId = await requireUserId();
    const profile = await getUserProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    return NextResponse.json({ data: profile });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
