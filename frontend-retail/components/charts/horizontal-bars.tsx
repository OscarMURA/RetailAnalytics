import { formatNumber } from "@/lib/constants";

interface BarRow {
  label: string;
  value: number;
  category?: string;
}

export function HorizontalBars({ data, color }: { data: BarRow[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const w = (d.value / max) * 100;
        return (
          <div key={i} className="group">
            <div className="flex items-center gap-3">
              <div className="w-5 text-[11px] text-slate-400 font-mono tabular-nums text-right">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{d.label}</div>
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{formatNumber(d.value)}</div>
                </div>
                <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{ width: `${w}%`, background: color }}
                  />
                </div>
                {d.category && <div className="text-[11px] text-slate-400 mt-1">{d.category}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
