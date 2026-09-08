import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { listAssignedClientIds, requireRole } from "@/domain/authz/service";

/** GET /api/trainer/clients — TRAINER-only. Çağırana atanmış client id'lerini döner. */
export async function GET() {
  try {
    const userId = await requireUserId();
    await requireRole(userId, ["TRAINER"]);

    const clientIds = await listAssignedClientIds(userId);
    return NextResponse.json({ data: clientIds });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
