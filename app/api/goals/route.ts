import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { getCurrentGoalsForUser } from "@/domain/goals/service";

/** GET /api/goals — çağıran kullanıcının güncel günlük nutrition hedeflerini döner. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const goals = await getCurrentGoalsForUser(userId);
  return NextResponse.json({ data: goals });
}

// NOT: Kasıtlı olarak burada bir POST/PUT yok. Hedef belirleme
// (domain/goals/service.ts -> setGoalsForUser) yalnızca trainer veya sistem
// tarafından yapılabilir ve bunun için trainer/sistem rollerini ayırt eden
// bir yetkilendirme katmanı gerekir. Bu katman henüz kurulmadığı için hedef
// yazma uç noktası, yanlışlıkla yetkisiz yazmaya izin vermemek adına şimdilik
// eklenmedi — bkz. kalan eksikler (proje raporu).
