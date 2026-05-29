import { Fragment } from "react";
import type { CorrelationResponse } from "@/lib/types";

function colorFor(v: number): string {
  const ramp = (c1: number[], c2: number[], t: number) =>
    c1.map((c, i) => Math.round(c + (c2[i] - c) * t));
  const red = [239, 68, 68];
  const white = [255, 255, 255];
  const green = [5, 150, 105];
  if (v < 0) {
    const t = 1 - Math.min(1, Math.abs(v));
    const [r, g, b] = ramp(red, white, t);
    return `rgb(${r},${g},${b})`;
  }
  const t = 1 - Math.min(1, v);
  const [r, g, b] = ramp(green, white, t);
  return `rgb(${r},${g},${b})`;
}

export function CorrelationHeatmap({ labels, matrix }: CorrelationResponse) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div
        className="grid min-w-[440px]"
        style={{
          gridTemplateColumns: `clamp(96px, 22vw, 160px) repeat(${labels.length}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {labels.map((l) => (
          <div key={l} className="text-[11px] text-slate-500 font-medium text-center pb-2">
            {l}
          </div>
        ))}
        {matrix.map((row, i) => (
          <Fragment key={i}>
            <div className="text-[11px] sm:text-xs text-slate-700 font-medium pr-2 sm:pr-3 py-2 text-right leading-tight self-center">
              {labels[i]}
            </div>
            {row.map((v, j) => (
              <div
                key={j}
                className="aspect-square m-0.5 rounded-md border border-white/40 grid place-items-center text-[12px] font-semibold tabular-nums transition-transform hover:scale-105 hover:z-10 hover:shadow-pop"
                style={{ background: colorFor(v), color: Math.abs(v) > 0.55 ? "#fff" : "#0f172a" }}
                title={`${labels[i]} × ${labels[j]} = ${v.toFixed(2)}`}
              >
                {v.toFixed(2)}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
