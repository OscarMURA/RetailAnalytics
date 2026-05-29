// Typed contract for the RetailAnalytics FastAPI backend.
// Mirrors the shapes documented in backend/API_CONTRACT.md.

export type KpiIcon = "package" | "activity" | "users" | "box" | "store";
export type KpiDirection = "up" | "down" | "flat";

// ── Global filters ────────────────────────────────────────────────────
export interface MetaResponse {
  stores: string[]; // store ids, e.g. "102"
  dateMin: string; // YYYY-MM-DD
  dateMax: string; // YYYY-MM-DD
}

export interface DataFilters {
  stores: string[]; // store ids; empty = all
  from: string | null; // YYYY-MM-DD
  to: string | null; // YYYY-MM-DD
}

export interface Kpi {
  key: string;
  label: string;
  value: number;
  delta: number;
  direction: KpiDirection;
  icon: KpiIcon;
}

export interface KpisResponse {
  kpis: Kpi[];
}

export interface TopProduct {
  rank: number;
  code: string;
  label: string;
  category: string;
  units: number;
}

export type CustomerSortBy = "transactions" | "units";

export interface TopCustomer {
  rank: number;
  id: string;
  units: number;
  transactions: number;
}

export interface CategoryItem {
  name: string;
  value: number; // % of total units
  units: number;
  transactions: number;
  customers: number;
}

export interface CategoriesResponse {
  items: CategoryItem[];
  activeCount: number;
  totalCount: number;
}

export interface CalendarDay {
  date: string; // ISO YYYY-MM-DD
  count: number;
  intensity: number; // 0..1
  dow: number; // 0=Mon .. 6=Sun
}

export interface CalendarResponse {
  days: CalendarDay[];
  peakDay: { date: string; count: number } | null;
  dailyAvg: number;
  trend30: { pct: number; direction: KpiDirection };
}

export interface CoverageResponse {
  activeCategories: number;
  totalCategories: number;
  rotatingProducts: number;
  activeStores: number;
  avgTicket: number;
}

// Días pico · serie de tiempo de transacciones con top-5 días marcados.
export interface PeakTimeseriesResponse {
  points: { date: string; transactions: number }[];
  top5: string[]; // dates matching points.date
}

export type Granularity = "day" | "week" | "month";

export interface TimeSeriesPoint {
  date: string;
  units: number;
  transactions: number;
}

export interface TimeSeriesResponse {
  total: number; // units
  avg: number;
  peak: number;
  totalTransactions: number;
  avgTransactions: number;
  peakTransactions: number;
  points: TimeSeriesPoint[];
}

export type BoxplotDimension =
  | "units-per-category"
  | "units-per-customer"
  | "transactions-per-customer";

export interface BoxplotBox {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export interface BoxplotStats {
  count: number;
  mean: number;
  p50: number; // median
}

export interface BoxplotResponse {
  dimension: BoxplotDimension;
  boxes: BoxplotBox[];
  stats: BoxplotStats;
}

export interface WeekdayDistribution {
  dow: number;
  label: string;
  units: number;
  transactions: number;
}

export interface CorrelationResponse {
  labels: string[];
  matrix: number[][];
}
