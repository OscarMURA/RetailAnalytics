import { AlertTriangle, Inbox } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin ${className}`}
    />
  );
}

export function LoadingBlock({ height = 200, label = "Cargando…" }: { height?: number; label?: string }) {
  return (
    <div
      className="w-full grid place-items-center text-slate-400"
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-3">
        <Spinner className="w-6 h-6" />
        <span className="text-xs font-medium">{label}</span>
      </div>
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
      <div className="flex flex-col items-center gap-3 text-center max-w-sm px-4">
        <span className="w-10 h-10 rounded-full bg-red-50 text-red-600 grid place-items-center ring-1 ring-red-100">
          <AlertTriangle size={20} />
        </span>
        <p className="text-sm text-slate-600">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
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
        <Inbox size={22} />
        <span className="text-xs font-medium">{message}</span>
      </div>
    </div>
  );
}
