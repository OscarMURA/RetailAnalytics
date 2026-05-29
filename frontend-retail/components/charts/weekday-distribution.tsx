"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { ChartTooltip } from "@/components/ui";
import { formatNumber } from "@/lib/constants";
import type { WeekdayDistribution } from "@/lib/types";

// dow: 0=Mon..6=Sun. Weekend (Sat=5, Sun=6) indigo; weekdays emerald.
function fillFor(dow: number): string {
  if (dow >= 5) return "#6366f1";
  return "#10b981";
}

export function WeekdayDistributionChart({ data }: { data: WeekdayDistribution[] }) {
  const max = Math.max(...data.map((d) => d.units), 1);
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#e2e8f0" }} fontSize={11} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            content={<ChartTooltip formatter={(v) => `${formatNumber(v)} u`} />}
          />
          <Bar dataKey="units" name="Unidades" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={fillFor(d.dow)} fillOpacity={(d.units / max) * 0.5 + 0.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
