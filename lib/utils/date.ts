/** Verilen tarihin UTC gün başlangıcını döndürür (saat 00:00:00.000). */
export function startOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Verilen tarihin bir sonraki UTC gününün başlangıcını döndürür (üst sınır, exclusive). */
export function endOfDayUTC(date: Date): Date {
  const start = startOfDayUTC(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "YYYY-MM-DD" biçimindeki bir tarihi o günün UTC başlangıcına çevirir.
 * Geçersiz biçim veya takvimde olmayan bir gün (ör. 2026-02-30) için `null`.
 */
export function parseIsoDateUTC(value: string): Date | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/** Tarihin UTC gününü "YYYY-MM-DD" olarak döner. */
export function toIsoDateUTC(date: Date): string {
  return startOfDayUTC(date).toISOString().slice(0, 10);
}

/** Verilen UTC gününe `days` gün ekler (negatif değer geri gider). */
export function addDaysUTC(date: Date, days: number): Date {
  return new Date(startOfDayUTC(date).getTime() + days * 24 * 60 * 60 * 1000);
}
