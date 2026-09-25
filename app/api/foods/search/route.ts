import { NextResponse } from "next/server";
import { mapAuthErrorToResponse, requireUserId } from "@/lib/authz/guard";
import { searchFoods } from "@/domain/foods/service";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;

/**
 * GET /api/foods/search?q=<metin> — elle öğün eklerken besin araması.
 * Yalnızca doğrulanmış besin değeri olan food'lar döner. Dönen `per_100g`
 * kaynak veridir; tüketilen miktarın değerleri yalnızca POST /api/meals
 * (ADIM 16) ile üretilir.
 */
export async function GET(request: Request) {
  try {
    await requireUserId();

    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < MIN_QUERY_LENGTH || q.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: `q ${MIN_QUERY_LENGTH}-${MAX_QUERY_LENGTH} karakter olmalı`,
        },
        { status: 400 },
      );
    }

    const results = await searchFoods(q);
    return NextResponse.json({ data: results });
  } catch (error) {
    const mapped = mapAuthErrorToResponse(error);
    if (mapped) return mapped;
    throw error;
  }
}
