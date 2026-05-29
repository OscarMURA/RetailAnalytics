"use client";

import {
  ResponsiveContainer,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Scatter,
  ComposedChart,
} from "recharts";
import { ChartTooltip } from "@/components/ui";
import { MONTHS_ES, formatNumber } from "@/lib/constants";
import type { PeakTimeseriesResponse } from "@/lib/types";

const fmtDate = (s: string | number) => {
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(s);
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
};

export function PeakTimeseries({ data }: { data: PeakTimeseriesResponse }) {
  const top5 = new Set(data.top5);
  const rows = data.points.map((p) => ({
    date: p.date,
    transactions: p.transactions,
    peak: top5.has(p.date) ? p.transactions : null,
  }));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaPeak" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
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
            width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip
            content={
              <ChartTooltip labelFormatter={fmtDate} formatter={(v) => `${formatNumber(v)} tx`} />
            }
          />
          <Area
            type="monotone"
            dataKey="transactions"
            name="Transacciones"
            stroke="#059669"
            strokeWidth={2}
            fill="url(#areaPeak)"
            activeDot={{ r: 4, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
          />
          <Scatter dataKey="peak" name="Día pico" fill="#f59e0b" shape="circle" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
