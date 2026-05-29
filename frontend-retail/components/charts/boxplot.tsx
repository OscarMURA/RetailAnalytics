"use client";

import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { BoxplotCategory } from "@/lib/types";

interface BoxRow {
  category: string;
  base: number;
  box: number;
  median: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

interface BoxShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: BoxRow;
}

function BoxShape({ x = 0, y = 0, width = 0, height = 0, payload }: BoxShapeProps) {
  if (!payload) return null;
  const { q1, q3, min: mn, max: mx, median: md } = payload;
  const yTop = y;
  const yBot = y + height;
  const range = q3 - q1 || 1;
  const yPerUnit = height / range;
  const yMedian = yBot - (md - q1) * yPerUnit;
  const yMin = yBot + (q1 - mn) * yPerUnit;
  const yMax = yTop - (mx - q3) * yPerUnit;
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} y1={yMin} x2={cx} y2={yMax} stroke="#0f766e" strokeWidth="1.2" />
      <line x1={x + 4} y1={yMin} x2={x + width - 4} y2={yMin} stroke="#0f766e" strokeWidth="1.2" />
      <line x1={x + 4} y1={yMax} x2={x + width - 4} y2={yMax} stroke="#0f766e" strokeWidth="1.2" />
      <rect x={x} y={yTop} width={width} height={height} fill="#10b981" fillOpacity="0.18" stroke="#059669" strokeWidth="1.4" rx="2" />
      <line x1={x} y1={yMedian} x2={x + width} y2={yMedian} stroke="#059669" strokeWidth="2" />
    </g>
  );
}

interface BoxTooltipProps {
  active?: boolean;
  payload?: { payload: BoxRow }[];
}

function BoxTooltip({ active, payload }: BoxTooltipProps) {
  if (!active || !payload || !payload[0]) return null;
  const d = payload[0].payload;
  const rows: [string, number][] = [
    ["Mín", d.min],
    ["Q1", d.q1],
    ["Mediana", d.median],
    ["Q3", d.q3],
    ["Máx", d.max],
  ];
  return (
    <div className="bg-slate-900 text-white rounded-lg shadow-pop px-3 py-2 text-xs">
      <div className="font-medium text-slate-200 mb-1">{d.category}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 tabular-nums">
          <span className="text-slate-400">{k}</span>
          <span className="font-semibold">{v} u</span>
        </div>
      ))}
    </div>
  );
}

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

function CategoryTick({ x = 0, y = 0, payload }: TickProps) {
  const full = payload?.value ?? "";
  const label = full.length > 16 ? `${full.slice(0, 15)}…` : full;
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={4} dx={-4} textAnchor="end" fontSize={10} fill="#64748b" transform="rotate(-35)">
        <title>{full}</title>
        {label}
      </text>
    </g>
  );
}

export function Boxplot({ data }: { data: BoxplotCategory[] }) {
  const rows: BoxRow[] = data.map((d) => ({
    category: d.category,
    base: d.q1,
    box: d.q3 - d.q1,
    median: d.median,
    min: d.min,
    max: d.max,
    q1: d.q1,
    q3: d.q3,
  }));
  const maxVal = Math.max(...data.map((d) => d.max), 1);
  const domainMax = Math.ceil(maxVal * 1.1);

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 16, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="category" tickLine={false} axisLine={{ stroke: "#e2e8f0" }} interval={0} tick={<CategoryTick />} height={72} />
          <YAxis tickLine={false} axisLine={false} domain={[0, domainMax]} width={32} />
          <Tooltip content={<BoxTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
          <Bar dataKey="box" stackId="a" shape={<BoxShape />} isAnimationActive={false} legendType="none" />
          <Bar dataKey="base" stackId="a" fill="transparent" stroke="none" legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
