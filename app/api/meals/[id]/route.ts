import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { deleteMealItemForUser } from "@/domain/meal/service";

/**
 * DELETE /api/meals/{id} — çağıranın KENDİ meal item'ını siler (soft delete,
 * `status = DELETED`). Kayıt yoksa, zaten silinmişse veya başka bir
 * kullanıcıya aitse aynı 404 döner — başkasının kaydının varlığı sızdırılmaz.
 * Trainer/admin başkası adına silemez (POST ile aynı kural).
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/meals/[id]">) {
  try {
    const userId = await requireUserId();
    const { id } = await ctx.params;

    const deleted = await deleteMealItemForUser(userId, id);
    if (!deleted) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
