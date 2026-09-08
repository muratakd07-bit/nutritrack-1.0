import { defineConfig } from "prisma/config";

/**
 * Prisma 7 CLI yapılandırması (migrate/introspect için). Runtime bağlantısı
 * (PrismaClient) bu dosyayı KULLANMAZ — o, lib/db/prisma.ts içindeki
 * @prisma/adapter-pg üzerinden ayrıca yapılandırılır. bkz.
 * https://pris.ly/d/prisma7-client-config
 *
 * NOT: `@prisma/config`'in `env()` yardımcısı, değişken tanımlı değilse bu
 * dosyanın YÜKLENMESİNİ tamamen engeller (`prisma validate`/`generate` bile
 * çalışamaz hale gelir). Bunun yerine `process.env` doğrudan okunuyor;
 * DATABASE_URL tanımlı değilse yalnızca gerçek bir migrate/introspect
 * komutu çalıştırıldığında anlamlı bir bağlantı hatası alınır.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
