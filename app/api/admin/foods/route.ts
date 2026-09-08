import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { requireRole } from "@/domain/authz/service";
import { createVerifiedFood } from "@/domain/foods/service";
import { createVerifiedFoodInputSchema } from "@/lib/validation/foods";

/**
 * POST /api/admin/foods — ADMIN-only. Sisteme yeni, doğrulanmış bir besin
 * ekler (bkz. domain/foods/service.ts). `source`/`source_ref` zorunlu/
 * opsiyonel alanları, ADIM 16'nın "güvenilir kaynak" kuralının izlenebilir
 * kanıtıdır — bu uç nokta değerleri kendisi ÜRETMEZ, yalnızca admin'in
 * girdiği (gerçek, doğrulanmış) değerleri kaydeder.
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

    const parsed = createVerifiedFoodInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const food = await createVerifiedFood({
      name: parsed.data.name,
      facts: parsed.data.facts,
      source: parsed.data.source,
      sourceRef: parsed.data.source_ref,
    });

    return NextResponse.json({ data: food }, { status: 201 });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
