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
