import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Basit sağlık kontrolü: veritabanı bağlantısının gerçekten çalışıp
 * çalışmadığını doğrular. DATABASE_URL henüz gerçek bir Postgres'e işaret
 * etmiyorsa (bu ortamda olduğu gibi) 503 döner — bu BEKLENEN bir durumdur,
 * route'un kendisinin hatalı olduğu anlamına gelmez.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "unreachable",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503 },
    );
  }
}
