import { formatNumber, MONTHS_ES } from "@/lib/constants";
import type { CalendarDay } from "@/lib/types";

function colorFor(intensity: number | null): string {
  if (intensity == null) return "#f1f5f9";
  if (intensity < 0.2) return "#ecfdf5";
  if (intensity < 0.4) return "#a7f3d0";
  if (intensity < 0.6) return "#6ee7b7";
  if (intensity < 0.8) return "#34d399";
  return "#059669";
}

export function CalendarHeatmap({ data }: { data: CalendarDay[] }) {
  if (!data.length) return null;

  // Parse as local dates (avoid UTC shift) and pad to start on Sunday.
  const first = new Date(`${data[0].date}T00:00:00`);
  const padLeft = first.getDay();
  const cells: (CalendarDay | null)[] = [...Array<null>(padLeft).fill(null), ...data];
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthLabels: { wi: number; label: string }[] = [];
  let prevMonth = -1;
  weeks.forEach((w, wi) => {
    const firstReal = w.find((c) => c);
    if (firstReal) {
      const m = new Date(`${firstReal.date}T00:00:00`).getMonth();
      if (m !== prevMonth) {
        monthLabels.push({ wi, label: MONTHS_ES[m] });
        prevMonth = m;
      }
    }
  });

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex gap-1 ml-6 mb-1.5 relative h-4">
          {weeks.map((_, wi) => {
            const m = monthLabels.find((x) => x.wi === wi);
            return (
              <div key={wi} className="w-3.5 shrink-0 text-[10px] text-slate-400 font-medium">
                {m?.label || ""}
              </div>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          <div className="flex flex-col gap-1 pt-0.5 w-4">
            {["", "L", "", "M", "", "V", ""].map((d, i) => (
              <div key={i} className="h-3.5 text-[10px] text-slate-400 font-medium leading-none">
                {d}
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {Array.from({ length: 7 }).map((_, di) => {
                  const cell = w[di];
                  return (
                    <div
                      key={di}
                      title={cell ? `${cell.date} · ${formatNumber(cell.count)} transacciones` : ""}
                      className="w-3.5 h-3.5 rounded-[3px] transition-transform hover:scale-125 hover:ring-2 hover:ring-emerald-300 cursor-pointer"
                      style={{ background: colorFor(cell?.intensity ?? null), opacity: cell ? 1 : 0.4 }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4 text-[11px] text-slate-500">
          <span>Menos</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-[3px]" style={{ background: colorFor(i) }} />
          ))}
          <span>Más</span>
        </div>
      </div>
    </div>
  );
}
