import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { createTrainerAssignment, requireRole } from "@/domain/authz/service";
import { createTrainerAssignmentInputSchema } from "@/lib/validation/authz";

/**
 * POST /api/admin/trainer-assignments — ADMIN-only. Bir trainer'ı bir
 * client'a atar. Hedefin gerçekten TRAINER rolünde olduğu
 * `domain/authz/service.ts` → `createTrainerAssignment` içinde ayrıca
 * doğrulanır.
 */
export async function POST(request: Request) {
  try {
    const actorId = await requireUserId();
    await requireRole(actorId, ["ADMIN"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = createTrainerAssignmentInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    await createTrainerAssignment(
      parsed.data.trainer_user_id,
      parsed.data.client_user_id,
    );
    return NextResponse.json({ data: { created: true } }, { status: 201 });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
