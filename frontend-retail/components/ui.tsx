import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Package, Activity, Users, Box } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/constants";
import type { Kpi, KpiIcon } from "@/lib/types";

// ── Card ──────────────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
  interactive = false,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-xl shadow-soft",
        interactive && "transition-all duration-200 hover:shadow-pop hover:-translate-y-px",
        padded && "p-4 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon && <span className="text-slate-400">{icon}</span>}
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h2>
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────
type BadgeTone = "slate" | "emerald" | "amber" | "red" | "blue" | "indigo" | "teal";

export function Badge({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Delta pill (used in KPI cards) ────────────────────────────────────
export function Delta({ value, direction }: { value: number; direction: Kpi["direction"] }) {
  const positive = direction === "up";
  const flat = direction === "flat";
  const Icon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const cls = flat
    ? "text-slate-500 bg-slate-100"
    : positive
      ? "text-emerald-700 bg-emerald-50"
      : "text-red-700 bg-red-50";
  const label = flat ? "estable" : `${positive ? "+" : ""}${value.toFixed(1)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md",
        cls,
      )}
    >
      <Icon size={12} strokeWidth={2.2} />
      {label}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────
const KPI_ICONS: Record<KpiIcon, ReactNode> = {
  package: <Package size={20} />,
  activity: <Activity size={20} />,
  users: <Users size={20} />,
  box: <Box size={20} />,
};

export function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <Card interactive className="p-5! ">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center ring-1 ring-emerald-100">
          {KPI_ICONS[kpi.icon]}
        </div>
        <Delta value={kpi.delta} direction={kpi.direction} />
      </div>
      <div className="mt-4">
        <div className="text-[28px] font-bold tracking-tight text-slate-900 leading-none tabular-nums">
          {formatNumber(kpi.value)}
        </div>
        <div className="mt-2 text-xs text-slate-500 font-medium">{kpi.label}</div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
        vs período anterior · 30 días
      </div>
    </Card>
  );
}

// ── Segmented control ────────────────────────────────────────────────
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-md transition-all",
            value === opt.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Recharts tooltip content ─────────────────────────────────────────
interface TooltipEntry {
  value: number;
  name: string;
  color?: string;
  fill?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (value: number, name: string, entry: TooltipEntry) => ReactNode;
  labelFormatter?: (label: string | number) => ReactNode;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-slate-900 text-white rounded-lg shadow-pop px-3 py-2 text-xs">
      {label !== undefined && (
        <div className="text-slate-300 font-medium mb-1">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 tabular-nums">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: entry.color || entry.fill }}
          />
          <span className="text-slate-300">{entry.name}:</span>
          <span className="font-semibold text-white">
            {formatter
              ? formatter(entry.value, entry.name, entry)
              : formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
