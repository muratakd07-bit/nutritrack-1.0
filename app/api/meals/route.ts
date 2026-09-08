import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { mealItemInputSchema } from "@/lib/validation/meal";
import {
  createMealItemForUser,
  listMealItemsForUser,
} from "@/domain/meal/service";
import { NutritionSourceNotImplementedError } from "@/domain/nutrition/contract";
import { IdempotencyKeyConflictError } from "@/domain/meal/repository";

/**
 * POST /api/meals — kullanıcı için yeni bir meal item oluşturur.
 *
 * Bu route calculated_nutrition değerlerini KENDİSİ ÜRETMEZ; yalnızca
 * validate edilmiş girdiyi domain/meal/service.ts'e iletir, o da ADIM 16
 * sözleşmesini çağırır. ADIM 16 henüz bağlanmadığı için bu uç nokta şu an
 * 501 (Not Implemented) döner — bu, mimari sınırın doğru çalıştığının
 * kanıtıdır, bir hata değildir.
 */
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = mealItemInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const mealItem = await createMealItemForUser(userId, parsed.data);
    return NextResponse.json({ data: mealItem }, { status: 201 });
  } catch (error) {
    if (error instanceof NutritionSourceNotImplementedError) {
      return NextResponse.json(
        { error: "nutrition_source_not_implemented", message: error.message },
        { status: 501 },
      );
    }
    if (error instanceof IdempotencyKeyConflictError) {
      return NextResponse.json(
        { error: "idempotency_conflict", message: error.message },
        { status: 409 },
      );
    }
    throw error;
  }
}

/** GET /api/meals — yalnızca çağıran kullanıcının kendi meal item'larını listeler. */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const items = await listMealItemsForUser(userId);
  return NextResponse.json({ data: items });
}
