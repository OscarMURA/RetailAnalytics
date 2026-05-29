"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/constants";
import type { BoxplotBox } from "@/lib/types";

interface HoverState {
  box: BoxplotBox;
  x: number;
  y: number;
}

const UNIT_LABELS: Record<string, string> = {
  "units-per-category": "u",
  "units-per-customer": "u",
  "transactions-per-customer": "tx",
};

// Self-contained responsive SVG boxplot with optional log scale, so whiskers,
// box and median are positioned by an explicit scale (Recharts has no native
// boxplot and its stacked-bar trick can't express a log axis).
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
  const height = 340;

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

  const padTop = 16;
  const padBottom = 78; // room for rotated labels
  const padLeft = 44;
  const padRight = 12;
  const plotW = Math.max(width - padLeft - padRight, 10);
  const plotH = height - padTop - padBottom;

  const rawMax = Math.max(...data.map((d) => d.max), 1);
  // Log scale needs a positive floor; values are counts ≥ 0.
  const floor = 0.8;
  const yMin = logScale ? floor : 0;
  const yMax = logScale ? rawMax * 1.15 : Math.ceil(rawMax * 1.1);

  const scaleY = (v: number) => {
    if (logScale) {
      const lv = Math.log10(Math.max(v, floor));
      const lmin = Math.log10(yMin);
      const lmax = Math.log10(yMax);
      const t = (lv - lmin) / (lmax - lmin || 1);
      return padTop + (1 - t) * plotH;
    }
    const t = (v - yMin) / (yMax - yMin || 1);
    return padTop + (1 - t) * plotH;
  };

  const n = data.length;
  const slot = plotW / Math.max(n, 1);
  const boxW = Math.min(slot * 0.5, 46);

  // Y gridlines / ticks
  const ticks: number[] = logScale
    ? [1, 10, 100, 1000, 10000, 100000].filter((t) => t >= yMin && t <= yMax)
    : Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i));

  return (
    <div ref={wrapRef} className="w-full relative" style={{ height }}>
      <svg width={width} height={height} className="overflow-visible">
        {ticks.map((t, i) => {
          const y = scaleY(t);
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize={10} fill="#64748b">
                {t >= 1000 ? `${t / 1000}k` : t}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const cx = padLeft + slot * i + slot / 2;
          const x = cx - boxW / 2;
          const yMinV = scaleY(d.min);
          const yMaxV = scaleY(d.max);
          const yQ1 = scaleY(d.q1);
          const yQ3 = scaleY(d.q3);
          const yMed = scaleY(d.median);
          const full = d.label;
          const short = full.length > 16 ? `${full.slice(0, 15)}…` : full;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover({ box: d, x: cx, y: yMaxV })}
              onMouseLeave={() => setHover(null)}
            >
              {/* whisker */}
              <line x1={cx} y1={yMinV} x2={cx} y2={yMaxV} stroke="#0f766e" strokeWidth={1.2} />
              <line x1={cx - boxW / 2 + 4} y1={yMinV} x2={cx + boxW / 2 - 4} y2={yMinV} stroke="#0f766e" strokeWidth={1.2} />
              <line x1={cx - boxW / 2 + 4} y1={yMaxV} x2={cx + boxW / 2 - 4} y2={yMaxV} stroke="#0f766e" strokeWidth={1.2} />
              {/* box */}
              <rect
                x={x}
                y={yQ3}
                width={boxW}
                height={Math.max(yQ1 - yQ3, 1)}
                fill="#10b981"
                fillOpacity={0.18}
                stroke="#059669"
                strokeWidth={1.4}
                rx={2}
              />
              {/* median */}
              <line x1={x} y1={yMed} x2={x + boxW} y2={yMed} stroke="#059669" strokeWidth={2} />
              {/* hover hit area */}
              <rect x={cx - slot / 2} y={padTop} width={slot} height={plotH} fill="transparent" />
              {/* label */}
              <g transform={`translate(${cx},${height - padBottom + 14})`}>
                <text textAnchor="end" fontSize={10} fill="#64748b" transform="rotate(-35)">
                  <title>{full}</title>
                  {short}
                </text>
              </g>
            </g>
          );
        })}
        {/* axis line */}
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH} stroke="#e2e8f0" />
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 bg-slate-900 text-white rounded-lg shadow-pop px-3 py-2 text-xs -translate-x-1/2"
          style={{ left: Math.min(Math.max(hover.x, 70), width - 70), top: Math.max(hover.y - 96, 0) }}
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
        </div>
      )}
    </div>
  );
}

export { UNIT_LABELS };
