import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import {
  ForbiddenError,
  requireAccessToUserData,
  resolveAssignedTrainerId,
} from "@/domain/authz/service";
import { getCurrentGoalsForUser, setGoalsForUser } from "@/domain/goals/service";
import { setGoalsInputSchema } from "@/lib/validation/goals";

/**
 * GET /api/goals[?user_id=<id>] — güncel günlük nutrition hedeflerini döner.
 * Yetki modeli `/api/meals` ile birebir aynı — bkz. o dosyadaki yorum.
 */
export async function GET(request: Request) {
  try {
    const actorId = await requireUserId();

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id") ?? actorId;

    if (targetUserId !== actorId) {
      await requireAccessToUserData(actorId, targetUserId);
    }

    const goals = await getCurrentGoalsForUser(targetUserId);
    return NextResponse.json({ data: goals });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}

/**
 * POST /api/goals — bir kullanıcı için günlük nutrition hedefi belirler.
 *
 * KURAL (ADIM 24): Bu uç nokta yalnızca ÇAĞIRANIN, `user_id` ile belirtilen
 * kullanıcıya atanmış bir TRAINER olmasını kabul eder. Kullanıcının kendi
 * hedefini yazması (self-write) veya ADMIN'in bu uçtan yazması KASITLI
 * OLARAK desteklenmiyor — kural #8 "yalnızca trainer veya system" bunu
 * gerektiriyor. `SYSTEM` aktörü bu HTTP uç noktasından hiçbir zaman
 * tetiklenmez (bkz. domain/authz/README.md, "system/service bir rol
 * değildir").
 */
export async function POST(request: Request) {
  try {
    const actorId = await requireUserId();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = setGoalsInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const targetUserId = parsed.data.user_id;
    const trainerId = await resolveAssignedTrainerId(actorId, targetUserId);
    if (!trainerId) {
      throw new ForbiddenError(
        "Yalnızca bu kullanıcıya atanmış bir trainer hedef belirleyebilir",
      );
    }

    const goal = await setGoalsForUser(targetUserId, parsed.data.goals, {
      type: "TRAINER",
      trainerUserId: actorId,
    });
    return NextResponse.json({ data: goal }, { status: 201 });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
