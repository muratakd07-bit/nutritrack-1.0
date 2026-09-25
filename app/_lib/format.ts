import { toIsoDateUTC } from "@/lib/utils/date";

/**
 * Yalnızca GÖRÜNTÜLEME biçimlendirmesi — değerler ADIM 16'nın ürettiği
 * snapshot'lardır, burada hesaplanmaz.
 */
export function formatNumber(value: number, maxFractionDigits = 1): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: maxFractionDigits });
}

/** Sunucu günleri UTC olarak tuttuğu için "bugün" de UTC günüdür. */
export function todayIso(): string {
  return toIsoDateUTC(new Date());
}

export function formatDayLabel(isoDate: string): string {
  const today = todayIso();
  if (isoDate === today) return "Bugün";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function formatShortDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
