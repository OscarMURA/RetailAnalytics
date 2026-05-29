"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { CHART_COLORS } from "@/lib/constants";
import { ChartTooltip } from "@/components/ui";
import type { CategoryItem } from "@/lib/types";

export function CategoriesDonut({ data, activeCount }: { data: CategoryItem[]; activeCount: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 items-center">
      <div className="relative w-full h-[260px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={70}
              outerRadius={108}
              strokeWidth={2}
              stroke="#fff"
              paddingAngle={1.5}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Categorías</div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{activeCount}</div>
            <div className="text-xs text-slate-500">activas</div>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-sm text-slate-700 flex-1">{d.name}</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums w-14 text-right">
              {d.value.toFixed(1)}%
            </span>
            <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  background: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
