"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartTooltip } from "@/components/ui";
import { MONTHS_ES, formatNumber } from "@/lib/constants";
import type { Granularity, TimeSeriesPoint } from "@/lib/types";

export function TimeSeriesChart({
  points,
  granularity,
}: {
  points: TimeSeriesPoint[];
  granularity: Granularity;
}) {
  const fmtDate = (s: string | number) => {
    const d = new Date(`${s}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(s);
    if (granularity === "month") return `${MONTHS_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
  };

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaUnits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            minTickGap={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={50}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip
            content={<ChartTooltip labelFormatter={fmtDate} formatter={(v) => `${formatNumber(v)} u`} />}
          />
          <Area
            type="monotone"
            dataKey="units"
            name="Unidades"
            stroke="#059669"
            strokeWidth={2}
            fill="url(#areaUnits)"
            activeDot={{ r: 4, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
