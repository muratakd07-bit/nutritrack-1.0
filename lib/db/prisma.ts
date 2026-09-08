import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma 7: driver adapter zorunlu (schema.prisma artık bağlantı URL'si
 * taşımıyor — bkz. prisma/schema.prisma ve prisma.config.ts).
 * DATABASE_URL boşsa adapter yine de oluşturulur; gerçek bağlantı hatası
 * (varsa) ilk sorguda ortaya çıkar — bu, app/api/health/route.ts'in test
 * ettiği durumdur.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? "",
  });
  return new PrismaClient({ adapter });
}

/**
 * Next.js dev modunda hot-reload sırasında her modül yenilemesinde yeni bir
 * PrismaClient (ve dolayısıyla yeni bir connection pool) oluşmasını önlemek
 * için global singleton deseni. Prod'da (serverless) her instance zaten
 * tekildir, bu guard sadece dev'de devreye girer.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
