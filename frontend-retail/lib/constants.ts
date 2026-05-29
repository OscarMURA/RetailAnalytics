// Brand palette derived from emerald/teal/blue/indigo.
export const PALETTE = {
  emerald600: "#059669",
  emerald500: "#10b981",
  emerald400: "#34d399",
  emerald100: "#d1fae5",
  emerald50: "#ecfdf5",
  teal500: "#14b8a6",
  teal400: "#2dd4bf",
  cyan500: "#06b6d4",
  blue500: "#3b82f6",
  indigo500: "#6366f1",
  indigo400: "#818cf8",
  amber500: "#f59e0b",
  red500: "#ef4444",
  slate900: "#0f172a",
  slate500: "#64748b",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
} as const;

// 6-color categorical palette for charts.
export const CHART_COLORS = [
  "#059669",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#0f766e",
];

export const MONTHS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export const nf = new Intl.NumberFormat("es-CO");
export const formatNumber = (v: number) => nf.format(v);
