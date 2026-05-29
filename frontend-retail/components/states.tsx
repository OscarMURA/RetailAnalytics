import { AlertTriangle, Inbox } from "lucide-react";

// Branded shimmer skeleton that loosely evokes a chart while data loads.
export function LoadingBlock({ height = 200 }: { height?: number; label?: string }) {
  // Deterministic bar heights so SSR and client render the same markup.
  const bars = [52, 74, 38, 88, 61, 46, 80, 57, 69, 42];
  return (
    <div className="w-full flex flex-col justify-end gap-3 px-1 pb-2" style={{ height }} aria-busy="true">
      <div className="flex items-end gap-2 sm:gap-3 flex-1 min-h-0">
        {bars.map((h, i) => (
          <div key={i} className="skeleton flex-1 rounded-md" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="skeleton h-2 w-full rounded-full" />
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
  height = 200,
}: {
  message: string;
  onRetry?: () => void;
  height?: number;
}) {
  return (
    <div className="w-full grid place-items-center" style={{ height }}>
      <div className="flex flex-col items-center gap-3 text-center max-w-sm px-4 pop-in">
        <span className="w-11 h-11 rounded-xl bg-red-50 text-red-500 grid place-items-center ring-1 ring-red-100">
          <AlertTriangle size={20} />
        </span>
        <p className="text-sm text-slate-600">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-lg text-white shadow-sm transition-transform hover:-translate-y-px"
            style={{ background: "var(--gradient-brand)" }}
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyBlock({ message = "Sin datos disponibles.", height = 200 }: { message?: string; height?: number }) {
  return (
    <div className="w-full grid place-items-center text-slate-400" style={{ height }}>
      <div className="flex flex-col items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-slate-50 text-slate-400 grid place-items-center ring-1 ring-slate-100">
          <Inbox size={20} />
        </span>
        <span className="text-xs font-medium">{message}</span>
      </div>
    </div>
  );
}
