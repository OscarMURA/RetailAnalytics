"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/constants";
import type { BoxplotBox } from "@/lib/types";

interface HoverState {
  box: Derived;
  x: number;
  y: number;
}

const UNIT_LABELS: Record<string, string> = {
  "units-per-category": "u",
  "units-per-customer": "u",
  "transactions-per-customer": "tx",
};

// Compact axis/marker formatter: 1994000 → "1.99M", 1496 → "1.5k".
function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 2)}M`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(a >= 10_000 ? 0 : 1)}k`;
  return `${Math.round(v)}`;
}

interface Derived extends BoxplotBox {
  // Tukey whisker caps (1.5×IQR fence, clamped to the actual min/max).
  whiskLo: number;
  whiskHi: number;
  outLo: number | null; // true min when it lies past the lower fence
  outHi: number | null; // true max when it lies past the upper fence
}

function derive(b: BoxplotBox): Derived {
  const iqr = Math.max(b.q3 - b.q1, 0);
  const upperFence = b.q3 + 1.5 * iqr;
  const lowerFence = b.q1 - 1.5 * iqr;
  const whiskHi = Math.min(b.max, upperFence);
  const whiskLo = Math.max(b.min, lowerFence);
  return {
    ...b,
    whiskHi,
    whiskLo,
    outHi: b.max > whiskHi + 1e-6 ? b.max : null,
    outLo: b.min < whiskLo - 1e-6 ? b.min : null,
  };
}

// Self-contained responsive horizontal SVG boxplot. Categories read left-to-right
// with no rotated labels. Whiskers are capped at the 1.5×IQR (Tukey) fence so a
// handful of extreme values can't crush the box to an invisible sliver — the true
// max is surfaced as a labelled outlier marker instead. The log-scale toggle drops
// the capping and shows the full range, already compressed by the log axis
// (Recharts has no native boxplot, hence the manual scale).
export function Boxplot({
  data,
  logScale = false,
  unit = "u",
}: {
  data: BoxplotBox[];
  logScale?: boolean;
  unit?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<HoverState | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boxes = data.map(derive);
  const n = boxes.length;

  // Row height adapts to count: a single distribution gets a tall, roomy row;
  // many categories pack tighter.
  const rowH = n <= 1 ? 110 : n <= 2 ? 90 : n <= 4 ? 70 : 48;
  const padTop = 14;
  const padBottom = 34; // x-axis ticks
  const labelW = Math.max(96, Math.min(170, Math.round(width * 0.34)));
  const padRight = 16;
  const plotX = labelW;
  const plotW = Math.max(width - labelW - padRight, 10);
  const plotH = rowH * n;
  const height = padTop + plotH + padBottom;

  // Domain: in linear mode bound by the (global) capped whisker so the boxes stay
  // legible; outliers beyond it are pinned at the edge. In log mode show everything.
  const rawMax = Math.max(...boxes.map((d) => d.max), 1);
  const cappedMax = Math.max(...boxes.map((d) => d.whiskHi), 1);
  const floor = 0.8;
  const xMin = logScale ? floor : 0;
  const xMax = logScale ? rawMax * 1.15 : cappedMax * 1.08 || 1;

  const scaleX = (v: number) => {
    const clamped = Math.min(Math.max(v, xMin), xMax);
    if (logScale) {
      const lv = Math.log10(Math.max(clamped, floor));
      const lmin = Math.log10(xMin);
      const lmax = Math.log10(xMax);
      const t = (lv - lmin) / (lmax - lmin || 1);
      return plotX + t * plotW;
    }
    const t = (clamped - xMin) / (xMax - xMin || 1);
    return plotX + t * plotW;
  };

  const ticks: number[] = logScale
    ? [1, 10, 100, 1000, 10000, 100000, 1000000].filter((t) => t >= xMin && t <= xMax)
    : Array.from({ length: 5 }, (_, i) => (xMax / 4) * i);

  const boxH = Math.min(rowH * 0.46, 30);
  const capH = boxH * 0.62;

  return (
    <div ref={wrapRef} className="w-full relative" style={{ height }}>
      <svg width={width} height={height} className="overflow-visible">
        {/* vertical gridlines + x ticks */}
        {ticks.map((t, i) => {
          const x = scaleX(t);
          return (
            <g key={`t${i}`}>
              <line x1={x} y1={padTop} x2={x} y2={padTop + plotH} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={x} y={padTop + plotH + 16} textAnchor="middle" fontSize={10} fill="#64748b">
                {compact(t)}
              </text>
            </g>
          );
        })}

        {boxes.map((d, i) => {
          const cy = padTop + rowH * i + rowH / 2;
          // Log scale shows the true min/max (it already compresses extremes);
          // linear scale caps the whisker at the Tukey fence and flags outliers.
          const xLo = scaleX(logScale ? d.min : d.whiskLo);
          const xHi = scaleX(logScale ? d.max : d.whiskHi);
          const xQ1 = scaleX(d.q1);
          const xQ3 = scaleX(d.q3);
          const xMed = scaleX(d.median);
          const boxLeft = Math.min(xQ1, xQ3);
          const boxRight = Math.max(xQ1, xQ3);
          const full = d.label;
          const maxChars = Math.floor((labelW - 14) / 6.2);
          const short = full.length > maxChars ? `${full.slice(0, maxChars - 1)}…` : full;
          const active = hover?.box.label === d.label;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover({ box: d, x: (boxLeft + boxRight) / 2, y: cy })}
              onMouseLeave={() => setHover(null)}
            >
              {/* full-row hover band */}
              <rect
                x={plotX}
                y={cy - rowH / 2}
                width={plotW}
                height={rowH}
                fill={active ? "#10b981" : "transparent"}
                fillOpacity={active ? 0.05 : 0}
              />
              {/* category label */}
              <text x={labelW - 12} y={cy + 3.5} textAnchor="end" fontSize={11} fill="#475569" fontWeight={500}>
                <title>{full}</title>
                {short}
              </text>

              {/* whisker line + caps */}
              <line x1={xLo} y1={cy} x2={xHi} y2={cy} stroke="#0f766e" strokeWidth={1.3} />
              <line x1={xLo} y1={cy - capH / 2} x2={xLo} y2={cy + capH / 2} stroke="#0f766e" strokeWidth={1.3} />
              <line x1={xHi} y1={cy - capH / 2} x2={xHi} y2={cy + capH / 2} stroke="#0f766e" strokeWidth={1.3} />

              {/* box (Q1 → Q3) */}
              <rect
                x={boxLeft}
                y={cy - boxH / 2}
                width={Math.max(boxRight - boxLeft, 2)}
                height={boxH}
                fill="#10b981"
                fillOpacity={active ? 0.28 : 0.18}
                stroke="#059669"
                strokeWidth={1.4}
                rx={3}
              />
              {/* median */}
              <line x1={xMed} y1={cy - boxH / 2} x2={xMed} y2={cy + boxH / 2} stroke="#047857" strokeWidth={2.4} />

              {/* upper outlier (true max past the fence) */}
              {!logScale && d.outHi != null && (
                <g>
                  <line
                    x1={xHi}
                    y1={cy}
                    x2={plotX + plotW - 9}
                    y2={cy}
                    stroke="#f59e0b"
                    strokeWidth={1.1}
                    strokeDasharray="2 3"
                  />
                  <path
                    d={`M ${plotX + plotW - 4} ${cy} l -5 -5 l -5 5 l 5 5 z`}
                    fill="#f59e0b"
                    stroke="#d97706"
                    strokeWidth={0.8}
                  />
                  <text
                    x={plotX + plotW - 14}
                    y={cy - boxH / 2 - 3}
                    textAnchor="end"
                    fontSize={9.5}
                    fill="#b45309"
                    fontWeight={600}
                  >
                    máx {compact(d.outHi)}
                  </text>
                </g>
              )}
              {/* lower outlier (rare, but honest) */}
              {!logScale && d.outLo != null && (
                <path
                  d={`M ${plotX + 4} ${cy} l 5 -5 l 5 5 l -5 5 z`}
                  fill="#f59e0b"
                  stroke="#d97706"
                  strokeWidth={0.8}
                />
              )}
            </g>
          );
        })}

        {/* y axis line */}
        <line x1={plotX} y1={padTop} x2={plotX} y2={padTop + plotH} stroke="#e2e8f0" />
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 bg-slate-900 text-white rounded-lg shadow-pop px-3 py-2 text-xs -translate-x-1/2"
          style={{ left: Math.min(Math.max(hover.x, 90), width - 90), top: Math.max(hover.y - 118, 0) }}
        >
          <div className="font-medium text-slate-200 mb-1 max-w-[180px] truncate">{hover.box.label}</div>
          {(
            [
              ["Máx", hover.box.max],
              ["Q3", hover.box.q3],
              ["Mediana", hover.box.median],
              ["Q1", hover.box.q1],
              ["Mín", hover.box.min],
            ] as [string, number][]
          ).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 tabular-nums">
              <span className="text-slate-400">{k}</span>
              <span className="font-semibold">
                {formatNumber(v)} {unit}
              </span>
            </div>
          ))}
          {!logScale && hover.box.outHi != null && (
            <div className="mt-1 pt-1 border-t border-slate-700 text-[10px] text-amber-300">
              Máx atípico · bigote acotado a {compact(hover.box.whiskHi)} {unit}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { UNIT_LABELS };
