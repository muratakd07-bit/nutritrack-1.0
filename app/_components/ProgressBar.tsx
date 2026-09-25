/** `current / goal` oranını gösterir; hedef yoksa boş çubuk. */
export function ProgressBar({
  current,
  goal,
  size = "sm",
}: {
  current: number;
  goal: number | null;
  size?: "sm" | "lg";
}) {
  const ratio = goal && goal > 0 ? current / goal : 0;
  const over = ratio > 1;
  return (
    <div
      className={`overflow-hidden rounded-full bg-slate-100 ${size === "lg" ? "h-3" : "h-2"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal ?? undefined}
      aria-valuenow={current}
    >
      <div
        className={`h-full rounded-full ${over ? "bg-amber-500" : "bg-emerald-500"}`}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
    </div>
  );
}
