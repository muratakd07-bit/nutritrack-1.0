import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { requireAccessToUserData } from "@/domain/authz/service";
import { mealItemInputSchema } from "@/lib/validation/meal";
import {
  createMealItemForUser,
  listMealItemsForUser,
} from "@/domain/meal/service";
import { FoodNutritionFactsNotFoundError } from "@/domain/nutrition/contract";
import { IdempotencyKeyConflictError } from "@/domain/meal/repository";

/**
 * POST /api/meals — kullanıcı için yeni bir meal item oluşturur.
 *
 * Bu route calculated_nutrition değerlerini KENDİSİ ÜRETMEZ; yalnızca
 * validate edilmiş girdiyi domain/meal/service.ts'e iletir, o da ADIM 16
 * sözleşmesini (domain/nutrition/contract.ts) çağırır. Belirtilen food_id
 * için doğrulanmış besin değeri (FoodNutritionFacts) henüz sisteme
 * girilmemişse 404 döner — bu MEKANİZMANIN çalıştığının kanıtıdır (ADIM 16
 * artık gerçek bir hesaplama motoruyla implemente edilmiştir), eksik olan
 * sadece o besinin verisidir.
 *
 * Not: POST her zaman ÇAĞIRANIN kendi hesabına yazar (başka bir kullanıcı
 * adına meal item oluşturma yetkisi kimseye — trainer'a bile — verilmez).
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();

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
      if (error instanceof FoodNutritionFactsNotFoundError) {
        return NextResponse.json(
          {
            error: "food_nutrition_facts_not_found",
            message: error.message,
          },
          { status: 404 },
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
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}

/**
 * GET /api/meals[?user_id=<id>] — meal item'ları listeler.
 *
 * `user_id` verilmezse çağıranın kendi verisi döner. Başka bir `user_id`
 * istenirse, çağıranın o kullanıcının verisine erişip erişemeyeceği
 * `domain/authz/service.ts` → `requireAccessToUserData` ile denetlenir
 * (kendi verisi: her zaman izinli; ADMIN: her zaman izinli; TRAINER: yalnızca
 * atanmış client'lar için izinli; aksi halde 403).
 */
export async function GET(request: Request) {
  try {
    const actorId = await requireUserId();

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id") ?? actorId;

    if (targetUserId !== actorId) {
      await requireAccessToUserData(actorId, targetUserId);
    }

    const items = await listMealItemsForUser(targetUserId);
    return NextResponse.json({ data: items });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
