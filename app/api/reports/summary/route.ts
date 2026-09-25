import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { requireAccessToUserData } from "@/domain/authz/service";
import { getCurrentGoalsForUser, toGoalsDto } from "@/domain/goals/service";
import { getDailySummariesForUser } from "@/domain/reports/dailySummary";
import { parseIsoDateUTC } from "@/lib/utils/date";

const MAX_DAYS = 31;

/**
 * GET /api/reports/summary[?date=YYYY-MM-DD][&days=N][&user_id=<id>]
 *
 * `date` (dahil, varsayılan: bugün, UTC) ile biten `days` (1-31, varsayılan
 * 1) günlük toplamları ve güncel hedefleri döner. Toplamlar yalnızca
 * MealItem snapshot'larının SUM'ıdır (bkz. domain/reports/dailySummary.ts).
 * Yetki modeli `/api/meals` GET ile aynıdır.
 */
export async function GET(request: Request) {
  try {
    const actorId = await requireUserId();

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id") ?? actorId;

    const dateParam = searchParams.get("date");
    const endDate = dateParam ? parseIsoDateUTC(dateParam) : new Date();
    if (!endDate) {
      return NextResponse.json(
        { error: "validation_error", message: "date YYYY-MM-DD olmalı" },
        { status: 400 },
      );
    }

    const daysParam = searchParams.get("days");
    const days = daysParam === null ? 1 : Number(daysParam);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      return NextResponse.json(
        { error: "validation_error", message: `days 1-${MAX_DAYS} arası bir tam sayı olmalı` },
        { status: 400 },
      );
    }

    if (targetUserId !== actorId) {
      await requireAccessToUserData(actorId, targetUserId);
    }

    const [goals, summaries] = await Promise.all([
      getCurrentGoalsForUser(targetUserId),
      getDailySummariesForUser(targetUserId, endDate, days),
    ]);

    return NextResponse.json({
      data: { goals: goals ? toGoalsDto(goals) : null, days: summaries },
    });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
